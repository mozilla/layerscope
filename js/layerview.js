/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 *  * License, v. 2.0. If a copy of the MPL was not distributed with this
 *   * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

LayerScope.NO_FRAMES = "No frames"

LayerScope.Config = {
  background: "pattern",
};

LayerScope.Node = function(graph) {
  this._registedObjs = [];
  this._graph = graph;
};

LayerScope.Node.prototype = {
  constructor: LayerScope.Node,

  input: function N_input(data) {
    this._registedObjs.forEach(
      function (element, index, array) {
        element.input(data);
      })
  },

  register: function N_register(obj) {
    this._registedObjs.push(obj);
  },

  begin: function N_begin() {
    this._registedObjs.forEach(
      function (element, index, array) {
        if (element['begin'])
          element.begin(this._graph);
      }.bind(this))
  },

  end: function N_end() {
    this._registedObjs.forEach(
      function (element, index, array) {
        if (element['end'])
          element.end();
      }.bind(this))
  },
};

/**
 * A ConnectionManager instance takes responsibility of
 * 1. Creating a connection with profile target.
 * 2. Detectting conntection broken
 * 3. Receiving packetes from the target.
 */
LayerScope.ConnectionManager = function(graph) {
  this._socket = null;
  this._graph = graph;
}

LayerScope.ConnectionManager.prototype = {
  constructor: LayerScope.ConnectionManager,
  isConnected: function CM_isConnected() {
    return this._socket;
  },

  disconnect: function CM_disconnect() {
    // Already disconnected.
    if (!this._socket) {
      return
    }

    //  Close socket.
    this._socket.close();
    this._socket = null;

    // Update UI
    $("#infomsg").empty();
    $("#connect").text("Connect");
  },

  connect: function CM_connect(url) {
    var urlinfo = this._parseURL(url);
    if (urlinfo.protocol.toLowerCase() == "ws") {
      this._socket = new WebSocket(url, 'binary');
      this._socket.binaryType = "arraybuffer";

      this._socket.onerror = function(ev) {
        $("#infomsg").attr("class", "info-error").html("Connection failed.");
        this._socket = null;
      }.bind(this);

      this._socket.onopen = function(ev) {
        $("#infomsg").attr("class", "info-ok").html("Connected.");
        $("#connect").text("Disconnect");

        // Start a session.
        this._graph.begin();
      }.bind(this);

      this._socket.onclose = function(ev) {
        this.disconnect();
      }.bind(this);

      this._socket.onmessage = this.onMessage.bind(this);
    } else {
      alert("protocol " + urlinfo.protocol + " not implemented");
    }
  },

  /**
  * Handle socket message
  * @param {MessageEvent} evt The message event
  */
  onMessage: function CM_onMessage(evt) {
    var data = evt.data;
    LayerScope.utils.ll("socket data: " + data.byteLength);

    var bytebuf = dcodeIO.ByteBuffer.wrap(data);
    this._graph.process(bytebuf);

    LayerScope.utils.ll("finished processing, offset now: " + bytebuf.offset +
                        ", buffer limit: " + bytebuf.limit);
  },

  /**
   * Send socket message
   * @param {ArrayBuffer} buffer The message buffer
   */
  sendMessage: function CM_sendMessage(buffer) {
    if (this._socket) {
      this._socket.send(buffer);
    }
  },

  /**
   * Parse URL
   * @param {string} url The url string
   * @return {object} The url object
   */
  _parseURL: function CM_parseURL(url) {
    var a =  document.createElement('a');
    a.href = url;
    return {
      protocol: a.protocol.replace(':',''),
      port: a.port
    };
  },
};

LayerScope.FrameController = {
  _slider: 0,
  _info: 0,

  attach: function FC_attach(slider, info) {
    this._slider = slider;
    this._info = info;

    slider.slider({
      value: 0,
      min: 0,
      max: 0,
      step: 1,
      slide: function(evt, ui) {
        // Don't kick off render while sliding, it makes whole page sluggish.
        max = this._slider.slider("option", "max");
        this._updateInfo(ui.value, max);
      }.bind(this),
      stop: function (event, ui) {
        LayerScope.Session.display(ui.value);
      }
    });

    this._info.html("<span>" + LayerScope.NO_FRAMES + "</span>");
  },

  /*
   * @param {int} selectedFrame the index of the selected frame, 0-index base.
   */
  update: function FC_update(selectedFrame, totalFrames, frameId) {
    var max = 0;
    if (totalFrames === undefined) {
      max = this._slider.slider("option", "max");
    } else {
      max = (totalFrames > 0) ? (totalFrames - 1) : 0;
    }

    var min = this._slider.slider("option", "min");

    // Validate arguments.
    console.assert(selectedFrame <= max && selectedFrame >= min ,
                   "FrameContoller.update: Invalid frame index");
    if (selectedFrame > max || selectedFrame < min) {
      return;
    }

    // Update this._slider
    if (totalFrames !== undefined) {
      this._slider.slider("option", "max", max);
    }
    if (selectedFrame !== undefined) {
      this._slider.slider("option", "value", selectedFrame);
    }

    //  Update this._info
    this._updateInfo(selectedFrame, max, frameId);
  },
  _updateInfo: function FC_updateInfo(selectedFrame, totalFrames, frameId) {
    if (totalFrames === 0) {
      this._info.html("<span>" + LayerScope.NO_FRAMES + "</span>");
    } else {
      if (frameId != undefined) {
        this._info.html("<span>Frame " + selectedFrame + "/" +
                        totalFrames + " &mdash; stamp: " +
                        frameId + "</span>");
      } else {
        this._info.html("<span>Frame " + selectedFrame + "/" +
                        totalFrames + "</span>");
      }
    }
  }
};


/**
 * Command handler, generate protcol buffer packets and send
 * to the WebSocket server
 */
LayerScope.CommandHandler = {
  _cmdPacket: null,
  _currCheckers: [],

  get cmdPacket() {
    if (!this._cmdPacket) {
      var builder = LayerScope.Session.pbbuilder;
      this._cmdPacket = builder.build("mozilla.layers.layerscope.CommandPacket");
    }
    return this._cmdPacket;
  },

  /**
   * Attach the command event to the checkbox
   * @param {string} cmd command string
   * @param {jQuery Selector} check the checkbox selector
   */
  attach: function CH_attach(cmd, check) {
    this._currCheckers.push({cmd: cmd,
                             selector: check});
    check.change(function() {
      LayerScope.CommandHandler.sendCommand(cmd, $(this).is(":checked"));
    });
  },

  /**
   * Synchronize checkers' statuses between servers and clients
   */
  syncStatus: function CH_syncStatus() {
    for (c of this._currCheckers) {
      let status = c.selector.is(":checked");
      this.sendCommand(c.cmd, status);
    }
  },

  /**
   * Handle command sending
   * @param {string} cmd command string
   * @param {boolean} value the boolean value for this cmd
   */
  sendCommand: function CH_sendCommand(cmd, value) {
    var p = new LayerScope.CommandHandler.cmdPacket(cmd, value);
    LayerScope.Session.connectionManager.sendMessage(p.encodeAB());
  },
};


LayerScope.Session = {
  _frames: [],
  _currentFrame: 0,
  _connectionManager: null,
  _pbufbuilder: null, // protocol buffer builder

  get connectionManager() {
    // Create connection manager on demand.
    if (this._connectionManager === null) {
      this._connectionManager = new LayerScope.ConnectionManager(this);
    }

    return this._connectionManager;
  },

  // Start a session.
  begin: function SS_begin(frames) {
    this._end();

    LayerScope.DataProcesserNode.begin();
    LayerScope.RendererNode.begin();

    $("#error-log").empty();

    // We should make sure that checkers' statuses are the same as
    // those on server side
    LayerScope.CommandHandler.syncStatus();

    // If frames is defined, that means we start a offline session.
    // Display the first frame by default.
    if (frames !== undefined) {
      // Offline session.
      this._frames = frames;
      this.display(0);
      LayerScope.FrameController.update(0, this._frames.length);
    } else {
      // Online session.
      LayerScope.FrameController.update(0, 0);
    }
  },

  // End a session. Release resources.
  _end: function SS_end() {
    LayerScope.RendererNode.end();
    LayerScope.DataProcesserNode.end();

    this._currentFrame = 0;
    this._frames = []
  },

  get frames() {
    // Make sure data URL generated.
    this._genDataURL();
    return this._frames;
  },

  get pbbuilder() {
    if (!this._pbufbuilder) {
      this._pbufbuilder = dcodeIO.ProtoBuf.loadProtoFile("js/protobuf/LayerScopePacket.proto");
    }
    return this._pbufbuilder;
  },

  /**
  * Convert frames to JSON
  * @param {object} frameData
  */
  dump: function SS_dump() {
    // Make sure data URL generated.
    this._genDataURL();

    function replacer(key, value) {
      if (key == "imageData") {
        return undefined;
      } else {
        return value;
      }
    }

    var json = JSON.stringify(this._frames, replacer);
    var blob = new Blob([json], {type: "application/json"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.download = "backup.json";
    a.href = url;
    a.textContent = "Download backup.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  /*
  * Convert image data to data URL
  */
  _genDataURL: function SS_genDataURL() {
    var canvasToSave = $("<canvas>")[0];
    var canvasToSaveCx = canvasToSave.getContext("2d");
    for (var i = 0; i < this._frames.length; ++i) {
      var frame = this._frames[i];
      for (var j = 0; j < frame.textures.length; ++j) {
        var t = frame.textures[j];
        if (t.imageData && (t.imageDataURL === undefined)) {
          canvasToSave.width = t.width;
          canvasToSave.height = t.height;
          canvasToSaveCx.putImageData(t.imageData, 0, 0);
          t.imageDataURL = canvasToSave.toDataURL();
        }
      }
    }
  },

  appendFrame: function SS_appendFrame(frame) {
    let advance = true;
    //if ((this._currentFrame == (this._frames.length - 1)) ||
    //    (this._currentFrame == 0 && this._frames.length == 0)) {
    //  advance = true;
    //}

    this._frames.push(frame);

    if (advance) {
      this.display(this._frames.length - 1);
    } else {
      LayerScope.FrameController.update(this._currentFrame, this._frames.length);
    }
  },

  display: function SS_display(frameIndex) {
    if (frameIndex === undefined) {
      // Force render current frame again.
      frameIndex = this._currentFrame;
    } else {
      console.assert(frameIndex < this._frames.length,
                     "LayerScope.Session.display: Invalid frame index");
      if (this._currentFrame == frameIndex) {
        return;
      }

      this._currentFrame = frameIndex;
      LayerScope.FrameController.update(frameIndex, this._frames.length);
    }

    LayerScope.RendererNode.input(this._frames[frameIndex]);
  },

  process: function SS_process(bytes) {
    LayerScope.DataProcesserNode.input(bytes);
  },
};

LayerScope.DataProcesserNode = new LayerScope.Node(LayerScope.Session);
LayerScope.RendererNode = new LayerScope.Node(LayerScope.Session);


$(function() {
  $("#bkgselect").change(function() {
    var val = $(this).val().toLowerCase();
    if (val != LayerScope.Config.background) {
      LayerScope.Config.background = val;
      LayerScope.Session.display();
    }
  });

  $("#connect").click(function() {
    let cm = LayerScope.Session.connectionManager;
    if (cm.isConnected()) {
      cm.disconnect();
    } else {
      var url = $("#urlfield")[0].value;
      cm.connect(url)
    }
  });

  $("#saveFrame").click(function() {
    LayerScope.Session.dump()
  });

  $("#loadFromFileBtn").change(function(evt) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var obj = e.target.result;
      var frames = JSON.parse(obj);

      LayerScope.Session.begin(frames);
    }

    var file = evt.target.files[0];
    reader.readAsText(file);
  });

  LayerScope.FrameController.attach($("#frameslider"), $("#info"));
  LayerScope.CommandHandler.attach("LAYERS_TREE", $("#checktree"));
  LayerScope.CommandHandler.attach("LAYERS_BUFFER", $("#checkbuffer"));
});
