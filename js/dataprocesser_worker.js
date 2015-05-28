/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

if (typeof LayerWorker == "undefined" || !LayerWorker) {
  LayerWorker = {};
}

onmessage = function (event) {
  if (!!event.data.pbuffer) {
    LayerWorker.PBDataProcesser.handle(event.data.pbuffer);
  }
  if(!!event.data.command) {
    LayerWorker.PBDataProcesser[event.data.command]();
  }
};

// Move LayerWorker.PBDataProcesser back to main thread is rather eaiser
// for debugging.
// To achieve it, you need to
// 1. set LayerWorker.MainThread as true.
// 2. include this js in layerview.html
//    <script type="application/javascript;version=1.8" src="js/dataprocesser_worker.js">
//    </script>
//    !! Make sure include dataprocesser_worker.js before dataprocesser_proxy.js!!
// Only do this for debugging, move dataparsing back to main thread will make whole UI
// sluggish.
LayerWorker.MainThread = false;

if (LayerWorker.MainThread) {
  LayerWorker.PBPacket = dcodeIO.ProtoBuf
    .loadProtoFile("js/protobuf/LayerScopePacket.proto")
    .build("mozilla.layers.layerscope.Packet")
    ;

    LayerWorker.OnMessage = onmessage;
} else {
  importScripts('../lib/protobuf/Long.js');
  importScripts('../lib/protobuf/ByteBufferAB.js');
  importScripts('../lib/protobuf/ProtoBuf.js');
  importScripts('../lib/lz4-decompress.js');
  importScripts('../lib/sha1.js');
  importScripts('common.js');
  importScripts('frame.js');

  LayerWorker.PBPacket = dcodeIO.ProtoBuf
    .loadProtoFile("./protobuf/LayerScopePacket.proto")
    .build("mozilla.layers.layerscope.Packet")
    ;
}

LayerWorker.PBDataProcesser = {
  _activeFrame: null,

  end: function PBP_end() {
    LayerWorker.TexBuilder.clear();
  },

  handle: function PDP_handle(data) {
    var pbuffer = LayerWorker.PBPacket.decode(data);
    switch(pbuffer.type) {
      case LayerWorker.PBPacket.DataType.FRAMESTART:
        this._setActiveFrame({low: pbuffer.frame.value.getLowBitsUnsigned(),
                              high: pbuffer.frame.value.getHighBitsUnsigned()});
        break;
      case LayerWorker.PBPacket.DataType.FRAMEEND:
        if (!!this.activeFrame) {
          this._processFrame();
        }
        break;
      case LayerWorker.PBPacket.DataType.COLOR:
        if (pbuffer.color != null && !!this.activeFrame) {
          this.activeFrame.colors.push(LayerWorker.ColorBuilder.build(pbuffer.color));
        }
        break;
      case LayerWorker.PBPacket.DataType.TEXTURE:
        if (pbuffer.texture != null && !!this.activeFrame) {
          this.activeFrame.textureNodes.push(LayerWorker.TexBuilder.build(pbuffer.texture));
        }
        break;
      case LayerWorker.PBPacket.DataType.LAYERS:
        if (pbuffer.layers != null && !!this.activeFrame) {
          this.activeFrame.layerTree =  LayerWorker.LayerTreeBuilder.build(pbuffer.layers);
        }
        break;
      case LayerWorker.PBPacket.DataType.META:
        // Skip META
        break;
      case LayerWorker.PBPacket.DataType.DRAW:
        if (pbuffer.draw != null && !!this.activeFrame) {
          this.activeFrame.draws.push(LayerWorker.DrawBuilder.build(pbuffer.draw));
        }
        break;
      default:
        console.assert(false, "Error: Unsupported packet type(" +
                               pbuffer.type +
                               "). Please update this viewer.");
    }
  },

  _setActiveFrame: function PDP_activeFrame(stamp) {
    if (!!this._activeFrame) {
        console.assert(false, "Error: Receive an unpaired active-frame message.");
    }

    this._activeFrame = new LayerScope.Frame(stamp);
  },

  get activeFrame() {
    return this._activeFrame;
  },

  _processFrame: function PDP_processFrame() {
    // Skip unpaired frame.
    if (!this._activeFrame) {
      console.assert(!!this._activeFrame);
    }

    // message
    var message = {frame: this._activeFrame,
                   images: LayerWorker.TexBuilder.transferImages()};
    // transferable list
    var transferables = [];
    for (var key in message.images) {
      if (message.images.hasOwnProperty(key)) {
        transferables.push(message.images[key].data.buffer);
      }
    }

    if (LayerWorker.MainThread) {
      LayerScope.ProtoDataProcesserProxy.receiveMessage({data: message});
    } else {
      // post message and transferable list.
      postMessage(message, transferables);
    }

    // clear active frame.
    this._activeFrame = null;
  },
};

LayerWorker.ColorBuilder = {
  build: function CB_build(pcolor) {
    return {
      type: "Color",
      color: pcolor.color,
      width: pcolor.width,
      height: pcolor.height,
      layerRef: {low: pcolor.layerref.getLowBitsUnsigned(),
                 high: pcolor.layerref.getHighBitsUnsigned()}
    };
  }
};

LayerWorker.TexBuilder = {
  // Hold hash/image map for a single frame session.
  _images: {},
  // Hold hash for a whole profile session.
  _keys: [],
  _contentMap:[],

  clear: function TB_clear() {
    this._images = {};
    this._keys = [];
    this._contentMap = [];
  },

  build: function TB_build(ptexture) {
    //  Create a texture node
    var layerRef = {
      low: ptexture.layerref.getLowBitsUnsigned(),
      high: ptexture.layerref.getHighBitsUnsigned()
    };
    // No image data means the content of this texture is not altered
    if (!ptexture.data) {
      for (var i = 0; i < this._contentMap.length; i++) {
        var element = this._contentMap[i];
        if (this._contentMap[i].name == ptexture.name) {
          var node = new LayerScope.TextureNode(ptexture.name,
                                                ptexture.target,
                                                this._contentMap[i].key,
                                                layerRef,
                                                ptexture.glcontext,
                                                false);
          return node;
        }
      }

      return null;
    }

    // New content.
    var key = this._cache(
      new Uint8Array(ptexture.data.buffer).subarray(ptexture.data.offset, ptexture.data.limit),
      ptexture.width,
      ptexture.height,
      ptexture.dataformat,
      ptexture.stride);

    var node = new LayerScope.TextureNode(ptexture.name,
                                        ptexture.target,
                                        key,
                                        layerRef,
                                        ptexture.glcontext,
                                        true);

    // Update content map.
    for (var i = 0; i < this._contentMap.length; i++) {
      if (this._contentMap[i].name == ptexture.name) {
        this._contentMap[i].key = key;
        break;
      }
    }
    if (i == this._contentMap.length) {
      this._contentMap.push({name: ptexture.name, key: key});
    }

    return node;
  },

  _cache: function TB_cache(source, width, height, format, stride) {
    var hash = sha1.hash(source);

    if (width == 0 || height == 0) {
      console.log("Viewer receive invalid texture info.");
      return null;
    }

    //  Cache matchs.
    if (-1 != this._keys.indexOf(hash)) {
      return hash;
    }

    // Generate a new cache image for this source.
    if ((format >> 16) & 1) {
      // it's lz4 compressed
      var decompressed = new Uint8Array(stride * height);
      if (0 > LZ4_uncompressChunk(source, decompressed)) {
        console.log("Error: uncompression error at: ", rv);
      }
      source = decompressed;
    }

    // Create a buffer.
    var imageData = new ImageData(width, height);

    // Fill this buffer by source image.
    if (stride == width * 4) {
      imageData.data.set(source);
    } else {
      var dstData = imageData.data;
      for (var j = 0; j < height; j++) {
        for (var i = 0; i < width; i++) {
          dstData[j * width * 4 + i * 4 + 0] = source[j * stride + i * 4 + 0];
          dstData[j * width * 4 + i * 4 + 1] = source[j * stride + i * 4 + 1];
          dstData[j * width * 4 + i * 4 + 2] = source[j * stride + i * 4 + 2];
          dstData[j * width * 4 + i * 4 + 3] = source[j * stride + i * 4 + 3];
        }
      }
    }

    var LOCAL_GL_BGRA = 0x80E1;
    // BGRA to RGBA
    if ((format & 0xFFFF) == LOCAL_GL_BGRA) {
      this._BGRA2RGBA(imageData);
    }

    this._images[hash] = imageData;//{buffer: imageData.data.buffer, width: width, height: height };
    this._keys.push(hash);

    return hash;
  },

  transferImages: function IDP_transferImages() {
    var tmp = this._images;
    this._images = {};

    return tmp;
  },

  _BGRA2RGBA: function IDP_BGRA2RGBA(imageData) {
    var view = new Uint8Array(imageData.data.buffer);
    for (var pos = 0; pos < view.length; pos += 4) {
      // Software RB swap.
      var b = view[pos];
      view[pos] = view[pos + 2];
      view[pos + 2] = b;
    }
  }
};

LayerWorker.LayerTreeBuilder = {
  build: function LTB_build(players) {
    var layers = [this._createLayerNode(layer) for (layer of players.layer)];
    return this._buildLayerTree(layers);
  },

   _createLayerNode: function LTB_createLayerNode(data) {
    var node = {
      type: data.type,
      ptr: {low: data.ptr.getLowBitsUnsigned(),
            high: data.ptr.getHighBitsUnsigned()},
      parentPtr: {low: data.parentPtr.getLowBitsUnsigned(),
                  high: data.parentPtr.getHighBitsUnsigned()},
      shadow: null,
      clip: !!data.clip ? {x: data.clip.x, y: data.clip.y, w: data.clip.w, h: data.clip.h} : null,
      transform: null,
      region: !!data.vRegion ? [{x:n.x, y:n.y, w:n.w, h:n.h} for (n of data.vRegion.r)] : null,
      opaque: data.cOpaque,
      alpha: data.cAlpha,
      opacity: data.opacity,
      scrollDir: data.direct,
      barID: !!data.barID ? {low: data.barID.getLowBitsUnsigned(), high: data.barID.getHighBitsUnsigned()} : null,
      mask: !!data.mask ? {low: data.mask.getLowBitsUnsigned(), high: data.mask.getHighBitsUnsigned} : null,

      // Specific layer data
      valid: !!data.valid ? [{x:n.x, y:n.y, w:n.w, h:n.h} for (n of data.valid.r)] : null,
      color: data.color,
      filter: data.filter,
      refID: !!data.refID ? {low: data.refID.getLowBitsUnsigned(), high: data.refID.getHighBitsUnsigned()} : null,
      size: !!data.size ? {w: data.size.w, h: data.size.h} : null
    };
    // handle shadow
    if (!!data.shadow) {
      node.shadow = {
        clip: !!data.shadow.clip ? {x: data.shadow.clip.x,
                                    y: data.shadow.clip.y,
                                    w: data.shadow.clip.w,
                                    h: data.shadow.clip.h} : null,
        transform: !!data.shadow.transform ? {is2D: !!data.shadow.transform.is2D,
                                              isID: !!data.shadow.transform.isID,
                                              m: [e for (e of data.shadow.transform.m)]} : null,
        region: !!data.shadow.vRegion ? [{x:n.x, y:n.y, w:n.w, h:n.h} for (n of data.shadow.vRegion.r)] : null
      };
    }
    // handle transform
    if (!!data.transform) {
      node.transform = {
        is2D: !!data.transform.is2D,
        isID: !!data.transform.isID,
        m: [ele for (ele of data.transform.m)]
      };
    }
    return node;
  },

  _buildLayerTree: function LTB_buildLayerTree(nodeList) {
    var roots = [];
    var children = {}; // hash table: parent address -> children array

    // TreeNode Construct
    var treeNode = function(property) {
      this.value = property;
      this.children = [];
    };

    for (var item of nodeList) {
      var p = item.parentPtr.low;
      var target = !p ? roots : (children[p] || (children[p] = []));
      target.push(new treeNode(item));
    }

    // DFS traverse by resursion
    var findChildren = function(papa){
      if (children[papa.value.ptr.low]) {
        papa.children = children[papa.value.ptr.low];
        for (var ch of papa.children) {
          findChildren(ch);
        }
      }
    };

    for (var r of roots) {
      findChildren(r);
    }

    return roots;
  },
};

LayerWorker.DrawBuilder = {
  build: function CB_build(pdraw) {
    return {
      layerRef: {
        low: pdraw.layerref.getLowBitsUnsigned(),
        high: pdraw.layerref.getHighBitsUnsigned()
      },
      offsetX: pdraw.offsetX,
      offsetY: pdraw.offsetY,
      mvMatrix: pdraw.mvMatrix,
      totalRects: pdraw.totalRects,
      layerRect: pdraw.layerRect,
    };
  }
};
