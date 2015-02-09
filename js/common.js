/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 *  * License, v. 2.0. If a copy of the MPL was not distributed with this
 *   * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

LayerScope.utils = {
  /**
  * Log function
  * @param {string} s
  */
  _lines: 0,
  ll: function u_ll(s) {
    // For debugging
    //console.log(s);
    return;

    if(lines++ > 500){
      $("#log").empty();
      lines = 0;
    }

    $("#log").append($("<span>" + s + "</span><br>"));
  },
  /**
  * Convert rgba to css format
  * @param {number} val
  * @return {string} Color data in css format
  */
  rgbaToCss: function u_rgbaToCss(val) {
    // the value is abgr, little-endian packed
    var r = val & 0xff;
    var g = (val >>> 8) & 0xff;
    var b = (val >>> 16) & 0xff;
    var a = (val >>> 24) & 0xff;

    return "rgba(" + r + "," + g + "," + b + "," + a/255.0 + ")";
  },

  /**
  * Convert to Hex format (8)
  * @param {number} val
  * @return {string} String in hex format (8 bits)
  */
  hex8: function u_hex8(val) {
    return "0x" + this._pad0(val.toString(16), 8);
  },

  /**
  * Convert to Hex format (16)
  * @param {number} vh High bits
  * @param {number} vl Low bigs
  * @return {string} String in hex format (16 bits)
  */
  hex16: function u_hex16(vh, vl) {
    return "0x" + this._pad0(vh.toString(16), 8) + this._pad0(vl.toString(16), 8);
  },

  /**
  * Pad zeros
  * @param {string} s Any string
  * @param {number} cnt The number of 0
  * @return {string} Any string with "0" prefix
  */
  _pad0: function u_pad0(s, cnt) {
    while (s.length < cnt) {
      s = "0" + s;
    }
    return s;
  },

  modal: function u_modal(msg, title) {
    var $dialog = $("<div>");
    $dialog.html(msg);
    $dialog.dialog({
      title: title,
      modal: true });
  }
};

LayerScope.Frame = function (stamp) {
  this.id = stamp || {low: 0, high: 0};
  this.colors = [];
  this.layerTree= [];
  this.textureNodes = [];
};

//  Don't append any functions to this object, since we will
//  serialize/deserialize this object into JSON string.
LayerScope.TextureNode = function(name, target, texID, layerRef, contextRef) {
  this.name = name;
  this.target = target;

  // Don't keep layer or texture object here. Instead, keep id of them.
  // So that we don't need relink action in LayerScope.Storage.load.
  this.layerRef = layerRef;
  this.contextRef = contextRef;
  this.texID = texID;
}

LayerScope.TexturePool = function () {
  this._cacheImages = {};
  this._ctx = $("<canvas>").width(1).height(1)[0].getContext("2d");
};

LayerScope.TexturePool.prototype.findTexture = function (hash) {
  if (!hash) {
    return null;
  }

  console.assert(hash in this._cacheImages, "Try to find a key which does not exist.");
  return this._cacheImages[hash];
}

LayerScope.TexturePool.prototype.addTexture = function (key, value, width, height) {
  if (this._cacheImages[key] !== undefined) {
    console.log("TexturePool hash collision detected");
    return;
  }
  var texture = { imageData: value, width: width, height: height };
  this._cacheImages[key] = texture;
}

LayerScope.TexturePool.prototype.createTexture = function (source, width, height, format, stride) {
  var hash = sha1.hash(source);

  if (width == 0 || height == 0) {
    console.log("Viewer receive invalid texture info.");
    return null;
  }
  var texture = {};
  texture.width = width;
  texture.height = height;

  //  Cache matchs.
  if (hash in this._cacheImages) {
    return hash;
  }

  // Generate a new cache image for this source.
  if ((format >> 16) & 1) {
    // it's lz4 compressed
    let decompressed = new Uint8Array(stride * height);
    if (0 > LZ4_uncompressChunk(source, decompressed)) {
      console.log("Error: uncompression error at: ", rv);
    }
    source = decompressed;
  }

  // Create a buffer.
  texture.imageData = this._ctx.createImageData(width, height);

  // Fill this buffer by source image.
  if (stride == width * 4) {
    texture.imageData.data.set(source);
  } else {
    let dstData = texture.imageDaga.data;
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        dstData[j * width * 4 + i * 4 + 0] = source[j * stride + i * 4 + 0];
        dstData[j * width * 4 + i * 4 + 1] = source[j * stride + i * 4 + 1];
        dstData[j * width * 4 + i * 4 + 2] = source[j * stride + i * 4 + 2];
        dstData[j * width * 4 + i * 4 + 3] = source[j * stride + i * 4 + 3];
      }
    }
  }
  this._cacheImages[hash] = texture;

  return hash;
};


LayerScope.TaskChain = {
  _tasks: [],
  _currentTask: 0,
  onComplete: null,

  addTask: function TC_addTask(_function, _arg) {
    this._tasks.push([_function, _arg]);
  },

  empty: function TC_empty() {
    this._stop();
  },

  start: function TC_start() {
    this._currentTask = 0;
    setTimeout(this._exeTask.bind(this), 0);
  },

  _exeTask: function TC_exeTask() {
    if (this._tasks.length == this._currentTask) {
      this._stop();
      if (!!this.onComplete) {
        this.onComplete();
      }
      return;
    }
    var _function = this._tasks[this._currentTask][0];
    var _arg = this._tasks[this._currentTask][1];
    _function(_arg);

    this._currentTask++;
    setTimeout(this._exeTask.bind(this), 0);
  },

  _stop: function() {
    this._tasks = [];
    this._currentTask = 0;
  }
};
