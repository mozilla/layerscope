/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 *  * License, v. 2.0. If a copy of the MPL was not distributed with this
 *   * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

// Process sockect data from the profile target.
LayerScope.ProtoDataProcesser = {
  _graph: null,
  _ctx: null,
  _packet: null,
  _receivingFrame: null,
  _imageCache: {},

  // Create protocol message object once we really need it.
  _lazyBuild: function PDP_lazyBuild() {
    if (this._packet !== null)
      return

    var builder = dcodeIO.ProtoBuf.loadProtoFile("js/LayerScopePacket.proto");
    this._packet = builder.build("mozilla.layers.layerscope.Packet");
  },

  begin: function PDP_begin(graph) {
    this.end();
    this._graph = graph;

    let canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    this._ctx = canvas.getContext("2d");
  },

  end: function PDP_end() {
    this._imageCache = {};
    this._graph = null;
    this._receivingFrame = null;
    this._ctx = null;
  },

  /**
  * Process data buffer by google protocol buffer
  * @param {bytes} buffer The data buffer from google protocol buffer
  */
  input: function PDP_input(bytes) {
    this._lazyBuild();

    let p = null;
    try {
      p = this._packet.decode(bytes);
    } catch (e) {
      console.log("Fatal error: Decode ByteBuffer failed! Maybe you should update the .proto file.");
      return;
    }

    switch(p.type) {
      case this._packet.DataType.FRAMESTART:
        LayerScope.utils.ll("FRAMESTART packet");
        // TBD:
        // Why we need to proceessFrame here?
        // Why not processFrame only while receiving FRAMEEND?
        this._processFrame();

        if (p.frame != null) {
          this._ensureReceivingFrame({low: p.frame.value.getLowBitsUnsigned(),
                                high: p.frame.value.getHighBitsUnsigned()});
        }
        break;

      case this._packet.DataType.FRAMEEND:
        LayerScope.utils.ll("FRAMEEND packet");
        this._processFrame();
        break;

      case this._packet.DataType.COLOR:
        LayerScope.utils.ll("COLOR packet");
        this._ensureReceivingFrame();

        if (p.color != null) {
          this._receivingFrame.colors.push(this._getColorData(p.color));
        }
        break;

      case this._packet.DataType.TEXTURE:
        LayerScope.utils.ll("TEXTURE Packet");
        this._ensureReceivingFrame();

        if (p.texture != null) {
          this._receivingFrame.textures.push(this._getTexData(p.texture));
        }
        break;

      case this._packet.DataType.LAYERS:
        LayerScope.utils.ll("Layer Tree (Layers Dump)");
        this._ensureReceivingFrame();

        this._receivingFrame.layers = p.layers;
        break;

      default:
        console.assert(false, "Error: Unsupported packet type. Please update this viewer.");
    }
  },
  /**
  * Process the specific frame
  * @param {object} frame
  */
  _processFrame: function PDP_processFrame() {
    if (this._receivingFrame == null) {
      return
    }

    this._graph.appendFrame(this._receivingFrame);
    this._receivingFrame = null;
  },
  /**
  * Check receivingFrame, or initialize it
  * @param {Object} stamp stamp object {low: ..., high: ...},
  *                       both fields are unsigned numbers
  */
  _ensureReceivingFrame : function PDP_ensureReceivingFrame(stamp) {
    if (this._receivingFrame)
      return;

    this._receivingFrame = {
      id: stamp || {low: 0, high: 0},
      textures: [],
      colors: [],
      layers: []
    };
  },
  _getColorData: function PDP_getColorData(pcolor) {
    return {
      type: "Color",
      color: pcolor.color,
      width: pcolor.width,
      height: pcolor.height,
      layerRef: {low: pcolor.layerref.getLowBitsUnsigned(),
                 high: pcolor.layerref.getHighBitsUnsigned()}
    };
  },
  /**
  * Convert raw data buffer into a image
  * @param {ArrayBuffer} data The raw ArrayBuffer
  * @param {object} texData Texture data object
  * @return {object} Image data
  */
  _getTexData: function R_getImage(ptexture) {
    var t = ptexture;
    var texData = {
      name: ptexture.name,
      width: ptexture.width,
      height: ptexture.height,
      stride: ptexture.stride,
      target: ptexture.target,
      dataFormat: ptexture.dataformat,
      layerRef: {
        low: ptexture.layerref.getLowBitsUnsigned(),
        high: ptexture.layerref.getHighBitsUnsigned()},
      contextRef: ptexture.glcontext
    };

    var srcData = new Uint8Array(ptexture.data.toArrayBuffer());
    var hash = null; // sha1.hash(srcData);

    if (hash && hash in this._imageCache) {
      texData.imageData = this._imageCache[hash];
    } else if (texData.width > 0 && texData.height > 0) {
      if ((texData.dataFormat >> 16) & 1) {
        // it's lz4 compressed
        let dstData = new Uint8Array(texData.stride * texData.height);
        let rv = LZ4_uncompressChunk(srcData, dstData);
        if (rv < 0)
          console.log("Error: uncompression error at: ", rv);
        srcData = dstData;
      }

      // now it's uncompressed
      texData.imageData = this._ctx.createImageData(texData.width, texData.height);
      if (texData.stride == texData.width * 4) {
        texData.imageData.data.set(srcData);
      } else {
        let dstData = texData.imageData.data;
        for (let j = 0; j < texData.height; j++) {
          for (let i = 0; i < texData.width; i++) {
            dstData[j*texData.width*4 + i*4 + 0] = srcData[j*texData.stride + i*4 + 0];
            dstData[j*texData.width*4 + i*4 + 1] = srcData[j*texData.stride + i*4 + 1];
            dstData[j*texData.width*4 + i*4 + 2] = srcData[j*texData.stride + i*4 + 2];
            dstData[j*texData.width*4 + i*4 + 3] = srcData[j*texData.stride + i*4 + 3];
          }
        }
      }
      if (hash)
        this._imageCache[hash] = texData.imageData;
    }

    return texData;
  }
};

LayerScope.DataProcesserNode.register(LayerScope.ProtoDataProcesser)
