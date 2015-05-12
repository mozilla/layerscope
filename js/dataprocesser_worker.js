if (typeof LayerWorker == "undefined" || !LayerWorker) {
  LayerWorker = {};
}

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

onmessage = function (event) {
  LayerWorker.PBDataProcesser.handle(event.data);
};

LayerWorker.PBDataProcesser = {
  _activeFrame: null,

  handle: function PDP_handle(data) {
    var pbuffer = LayerWorker.PBPacket.decode(data);
    switch(pbuffer.type) {
      case LayerWorker.PBPacket.DataType.FRAMESTART:
        this._setActiveFrame({low: pbuffer.frame.value.getLowBitsUnsigned(),
                              high: pbuffer.frame.value.getHighBitsUnsigned()});
        break;
      case LayerWorker.PBPacket.DataType.FRAMEEND:
        this._processFrame();
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
      default:
        console.assert(false, "Error: Unsupported packet type. Please update this viewer.");
    }
  },

  _setActiveFrame: function PDP_activeFrame(stamp) {
    if (!!this._activeFrame) {
        console.assert(false, "Error: Receive an unpaired active-frame message.");
    }

    this._activeFrame = new LayerScope.Frame(stamp);
  },

  get activeFrame() {
    console.assert(!!this._activeFrame);
    return this._activeFrame;
  },

  _processFrame: function PDP_processFrame() {
    console.assert(!!this._activeFrame);

    // message
    var message = {frame: this._activeFrame, 
                   images: LayerWorker.TexBuilder.flush()};
    // transferable list
    var transferables = [];
    for (var key in message.images) {
      if (message.images.hasOwnProperty(key)) {
        transferables.push(message.images[key].data.buffer);
      }
    }

    // post message and transferable list
    postMessage(message, transferables);

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
  _images: {},
  _keys: [],

  build: function TB_build(ptexture) {
    var key = this._cache(
      new Uint8Array(ptexture.data.buffer).subarray(ptexture.data.offset, ptexture.data.limit),
      ptexture.width,
      ptexture.height,
      ptexture.dataformat,
      ptexture.stride);
    
    //  Create a texture node
    var layerRef = {
      low: ptexture.layerref.getLowBitsUnsigned(),
      high: ptexture.layerref.getHighBitsUnsigned()
    };
    var node = new LayerScope.TextureNode(ptexture.name,
                                        ptexture.target,
                                        key,
                                        layerRef,
                                        ptexture.glcontext); 

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
      var dstData = imageDaga.data;
      for (var j = 0; j < height; j++) {
        for (var i = 0; i < width; i++) {
          dstData[j * width * 4 + i * 4 + 0] = source[j * stride + i * 4 + 0];
          dstData[j * width * 4 + i * 4 + 1] = source[j * stride + i * 4 + 1];
          dstData[j * width * 4 + i * 4 + 2] = source[j * stride + i * 4 + 2];
          dstData[j * width * 4 + i * 4 + 3] = source[j * stride + i * 4 + 3];
        }
      }
    }
    this._images[hash] = imageData;//{buffer: imageData.data.buffer, width: width, height: height };
    this._keys.push(hash);

    return hash;
  },

  flush: function IDP_flush() {
    var tmp = this._images;
    this._images = {};

    return tmp;
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
