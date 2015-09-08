/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

LayerScope.Config = {
  background: "pattern",
  drawQuadGrid: true,
  zoomRatio: 1.0,
};

LayerScope.utils = {
  _dumpLog: true,

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
    if (vh > 0) {
      return "0x" + vh.toString(16) + this._pad0(vl.toString(16), 8);
    } else {
      return "0x" + this._pad0(vl.toString(16), 8);
    }
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
  },

  /**
   * Wrap console.log, turn on/off all logs at once.
   */
  log: function u_log() {
    if (!this._dumpLog) {
      return;
    }

    console.log.apply(console, arguments);
  }
};

//  Don't append any functions to this object, since we will
//  serialize/deserialize this object into JSON string.
LayerScope.TextureNode = function(name, target, texID, layerRef, contextRef, newContent) {
  this.name = name;
  this.target = target;

  // Don't keep layer or texture object here. Instead, keep id of them.
  // So that we don't need relink action in LayerScope.Storage.load.
  this.layerRef = layerRef;
  this.contextRef = contextRef;
  this.texID = texID;
  this.newContent = newContent;
}

LayerScope.ImageDataPool = function () {
  this._cacheImages = {};
  this._ctx = $("<canvas>").width(1).height(1)[0].getContext("2d");
};

LayerScope.ImageDataPool.prototype.find = function (hash) {
  if (!hash) {
    return null;
  }

  console.assert(hash in this._cacheImages, "Try to find a key which does not exist.");
  return this._cacheImages[hash];
}

LayerScope.ImageDataPool.prototype.add = function (key, value) {
  if (this._cacheImages[key] !== undefined) {
    console.log("ImageDataPool hash collision detected");
    return;
  }

  this._cacheImages[key] = value;
}

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

LayerScope.MessageCenter = {
  _handlers: {},

  subscribe: function RMC_subscribe(msgName, o) {
    if (!(msgName in this._handlers)) {
      this._handlers[msgName] = [];
    }

    if (!(o in this._handlers[msgName])) {
      this._handlers[msgName].push(o);
    }
  },

  fire: function RMC_fire(msgName, value) {
    if (!(msgName in this._handlers)) {
      console.log("Fire an unsubscribed message: " + msgName);
      return;
    }

    var handlers = this._handlers[msgName];
    if (0 == handlers.length) {
      console.log("Fire an message with no listeners: " + msgName);
      return;
    }
    for (var i = 0; i < handlers.length; i++) {
      var o = handlers[i];
      o.notify(msgName, value);
    }
  }
};

