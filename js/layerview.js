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
  ratio: 100
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

  init: function N_init() {
    this._registedObjs.forEach(
      function (element, index, array) {
        if (element['init'])
          element.init(this._graph);
      }.bind(this))
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
    $("#connection-btn").button("option", "label", "Connect");
    $("#connection-btn").removeClass("button-danger-color");
  },

  connect: function CM_connect(url) {
    var urlinfo = this._parseURL(url);
    if (!urlinfo) {
      LayerScope.utils.modal("<p>Invalid URL.</p>", "Connection Failed");
    } else if (urlinfo.protocol != "ws") {
      let msg = "<p>Protocol " + urlinfo.protocol + " not implemented</p>";
      LayerScope.utils.modal(msg, "Connection Failed");
    } else {
      this._socket = new WebSocket(url, 'binary');
      this._socket.binaryType = "arraybuffer";

      this._socket.onerror = function(ev) {
        // Do this check to prevent onerror callback after onclose.
        if (!!this._socket) {
          let msg = "<p>Can not create a connection successfully.</p>\
                     <p>Possible reasons</p>\
                     <p>. URL is not correct</p>\
                     <p>. Network broken.</p>";
          LayerScope.utils.modal(msg, "Connection Failed");
        }
      }.bind(this);

      this._socket.onopen = function(ev) {
        $("#connection-btn").button("option", "label", "Disconnect");
        $("#connection-btn").addClass("button-danger-color");
        $("#save-btn").button({ "disabled" : false });

        // Start a session.
        this._graph.begin();
      }.bind(this);

      this._socket.onclose = function(ev) {
        this.disconnect();
      }.bind(this);

      this._socket.onmessage = this.onMessage.bind(this);
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
    var result =  url.match(/(\w+):\/\/([\w.]+):([0-9]+$)/i);
    if (!result) {
      return null;
    }
    return {
      protocol: result[1].toLowerCase(),
      port: result[3]
    };
  },
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
  _imageDataPool: null,
  _currentFrame: -1,
  _connectionManager: null,
  _pbufbuilder: null, // protocol buffer builder

  get connectionManager() {
    // Create connection manager on demand.
    if (this._connectionManager === null) {
      this._connectionManager = new LayerScope.ConnectionManager(this);
    }

    return this._connectionManager;
  },

  init: function SS_init() {
    LayerScope.FrameController.attach($("#frame-slider"), $("#frame-info"));
    LayerScope.ZoomController.attach($("#zoom-in"), $("#zoom-1-1"), $("#zoom-out"));
    LayerScope.CommandHandler.attach("LAYERS_TREE", $("#checktree"));
    LayerScope.CommandHandler.attach("LAYERS_BUFFER", $("#checkbuffer"));

    LayerScope.DataProcesserNode.init();
    LayerScope.RendererNode.init();
  },

  findImage: function SS_findImage(id) {
    return this._imageDataPool.findImage(id);
  },

  get imageDataPool() {
    return this._imageDataPool;
  },

  // Start a session.
  begin: function SS_begin(frames, pool) {
    this._end();

    LayerScope.DataProcesserNode.begin();
    LayerScope.RendererNode.begin();

    this._imageDataPool = pool ? pool : new LayerScope.ImageDataPool();

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

    this._currentFrame = -1;
    this._frames = []
  },

  get frame() {
    return this._frames[this._currentFrame];
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
    LayerScope.Storage.save(this._frames, this.imageDataPool);
  },

  appendFrame: function SS_appendFrame(frame) {
    let advance = false;
    //if ((this._currentFrame == (this._frames.length - 1)) ||
    //    (this._currentFrame == 0 && this._frames.length == 0)) {
    //  advance = true;
    //}
    if (this._currentFrame == -1)
      this._currentFrame = 0;

    this._frames.push(frame);

    if (advance) {
      this.display(this._frames.length - 1);
    } else {
      LayerScope.FrameController.update(this._currentFrame, this._frames.length);
    }
  },

  display: function SS_display(frameIndex) {
    if (frameIndex === undefined) {
      // There is no frame at all.
      if (this._currentFrame == -1) {
        return;
      }

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

  $("#url-address").addClass("ui-corner-all");

  $("#setting-button")
    .button({
      icons: {primary: null},
      text: false
    })
    .addClass("icon-setting")
    .click(function(event) {
      //$("#setting-options").toggle();
      if ($("#setting-options").css('display') == 'none') {
        $("#setting-options").fadeIn('1000');
      }
      else {
        $("#setting-options").fadeOut('500');
      }
    });

  $("#connection-btn").button()
    .on("click", function(event) {
      event.preventDefault();
      let cm = LayerScope.Session.connectionManager;
      if (cm.isConnected()) {
        cm.disconnect();
      } else {
        var url = $("#url-address")[0].value;
        cm.connect(url);
      }
    });

  $("#save-btn").button({ "disabled": true })
    .click(function() {
      LayerScope.Session.dump()
    });

  $("#load-file-btn").button()
    .on("click", function(evt) {
      $("#load-file-input").click();
    });

  $("#load-file-input").change(function(evt) {
    let cm = LayerScope.Session.connectionManager;
    if (cm.isConnected()) {
      cm.disconnect();
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      var data = e.target.result;
      try {
        LayerScope.Storage.load(data).then(
          function (storage) {
            $("#save-btn").button({ "disabled": false });
            LayerScope.Session.begin(storage[0], storage[1]);
          });
      } catch(e) {
        LayerScope.utils.modal("<p>Invalid zip file.</p>", "Loading Failed");
      }
    }

    var file = evt.target.files[0];
    reader.readAsArrayBuffer(file);
  });

  $(".resizable-left").resizable({
  //  autoHide: true,
  //  handles: 'e',
    resize: function(e, ui) {
      var parent = ui.element.parent();
      var remainingSpace = parent.width() - ui.element.outerWidth(),
          divTwo = ui.element.next(),
          divTwoWidth = (remainingSpace - (divTwo.outerWidth() - divTwo.width()))
                        / parent.width() * 100 - 2;
          divTwo.width(remainingSpace + "px");
          divTwo.css({left: ui.element.width() + "px"});
    },
    stop: function(e, ui) {
      var parent = ui.element.parent();
      ui.element.css({
        width: ui.element.width()/parent.width()*100+"%",
      });
      ui.element.next().css({
        left: ui.element.width() + "px"
      });
    }
  });

  $("#tree-pane").resizable({
    autoHide: true,
    handles: 's',
    resize: function(e, ui) {
      var parent = ui.element.parent();
      var remainingSpace = parent.height() - ui.element.outerHeight(),
          divTwo = ui.element.next(),
          divTwoHeight = (remainingSpace - (divTwo.outerHeight() - divTwo.height()))
                        / parent.height() * 100 - 2 + "%";
          divTwo.height(divTwoHeight);
    },
    stop: function(e, ui) {
      var parent = ui.element.parent();
      ui.element.css({
        height: ui.element.height()/parent.height()*100+"%",
      });
    }
  });

  // Hook left and right key to slide selected frame.
  $("body").keydown(function(e) {
    if(e.keyCode == 37) { // left
     LayerScope.FrameController.advance(false);
    }
    else if(e.keyCode == 39) { // right
     LayerScope.FrameController.advance(true);
    }
  });

  $("#zoom-button-set").buttonset();
  LayerScope.Session.init();
});
