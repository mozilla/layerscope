// GL Texture name
const GL_TEXTURE_2D = 0x0DE1;
const GL_TEXTURE_EXTERNAL = 0x8D65;
const GL_TEXTURE_RECTANGLE = 0x84F5;

var GLEnumNames = {};
GLEnumNames[GL_TEXTURE_2D] = "TEXTURE_2D";
GLEnumNames[GL_TEXTURE_EXTERNAL] = "TEXTURE_EXTERNAL";
GLEnumNames[GL_TEXTURE_RECTANGLE] = "TEXTURE_RECTANGLE";

// Global variable
var frames = [];
var currentFrameIndex = 0;
var imageCache = {};
var frameBackground = "pattern";
var socket;
var receivingFrame = null;
var gCanvasCx;

// Protocol buffer variable
var builder = dcodeIO.ProtoBuf.loadProtoFile("js/protobuf/LayerScopePacket.proto");
var Packet = builder.build("mozilla.layers.layerscope.Packet");

// Layer Type Map
const nameMap = [
  "UnknownLayer",
  "LayerManager",
  "ContainerLayer",
  "ThebesLayer",
  "CanvasLayer",
  "ImageLayer",
  "ColorLayer",
  "RefLayer",
  "ReadbackLayer"
];

/**
 * Log function
 * @param {string} s
 */
var lines = 0;
function ll(s) {
  //console.log(s);
  return;

  if(lines++ > 500){
    $("#log").empty();
    lines = 0;
  }

  $("#log").append($("<span>" + s + "</span><br>"));
}

/**
 * Parse URL
 * @param {string} url The url string
 * @return {object} The url object
 */
function parseURL(url) {
  var a =  document.createElement('a');
  a.href = url;
  return {
    source: url,
      protocol: a.protocol.replace(':',''),
      host: a.hostname,
      port: a.port,
      query: a.search,
      params: (function(){
        var ret = {},
      seg = a.search.replace(/^\?/,'').split('&'),
      len = seg.length, i = 0, s;
      for (;i<len;i++) {
        if (!seg[i]) { continue; }
        s = seg[i].split('=');
        ret[s[0]] = s[1];
      }
      return ret;
      })(),
      file: (a.pathname.match(/\/([^\/?#]+)$/i) || [,''])[1],
      hash: a.hash.replace('#',''),
      path: a.pathname.replace(/^([^\/])/,'/$1'),
      relative: (a.href.match(/tps?:\/\/[^\/]+(.+)/) || [,''])[1],
      segments: a.pathname.replace(/^\//,'').split('/')
  };
}

/**
 * Pad zeros
 * @param {string} s Any string
 * @param {number} cnt The number of 0
 * @return {string} Any string with "0" prefix
 */
function pad0(s, cnt) {
  while (s.length < cnt) {
    s = "0" + s;
  }
  return s;
}

/**
 * Convert to Hex format (8)
 * @param {number} val
 * @return {string} String in hex format (8 bits)
 */
function hex8(val) {
  return "0x" + pad0(val.toString(16), 8);
}

/**
 * Convert to Hex format (16)
 * @param {number} vh High bits
 * @param {number} vl Low bigs
 * @return {string} String in hex format (16 bits)
 */
function hex16(vh, vl) {
  return "0x" + pad0(vh.toString(16), 8) + pad0(vl.toString(16), 8);
}

/**
 * Convert rgba to css format
 * @param {number} val
 * @return {string} Color data in css format
 */
function rgbaToCss(val) {
  // the value is abgr, little-endian packed
  var r = val & 0xff;
  var g = (val >>> 8) & 0xff;
  var b = (val >>> 16) & 0xff;
  var a = (val >>> 24) & 0xff;

  return "rgba(" + r + "," + g + "," + b + "," + a/255.0 + ")";
}

/**
 * Clear all frames
 */
function clearFrames() {
  frames = [];
  imageCache = {};

  $("#frameslider").slider("value", 0);
  $("#frameslider").slider("option", "min", 0);
  $("#frameslider").slider("option", "max", 0);
}

/**
 * Check receivingFrame, or initialize it
 * @param {Long} value Address
 */
function ensureReceivingFrame(value) {
  if (receivingFrame)
    return;

  receivingFrame = {
    id: value || 0,
    textures: [],
    colors: [],
    layers: "" // JSON string
  };
}

/**
 * Update the specific frame
 * @param {number} findex Frame index
 */
function updateInfo(findex) {
  if (findex === undefined)
    findex = $("#frameslider").slider("value");
  if (frames.length == 0) {
    $("#info").html("<span>No frames.</span>");
  } else {
    var time = hex16(frames[findex].id.getHighBitsUnsigned(), frames[findex].id.getLowBitsUnsigned());
    $("#info").html("<span>Frame " + findex + "/" + (frames.length-1) + " &mdash; stamp: " + time + "</span>");
  }
}

/**
 * Process the specific frame
 * @param {object} frame
 */
function processFrame(frame) {
  var cur = $("#frameslider").slider("value");
  var advance = false;
  if ((cur == 0 && frames.length == 0) ||
      cur == (frames.length-1))
  {
    advance = true;
  }

  frames.push(frame);
  $("#frameslider").slider("option", "max", frames.length-1);
  if (advance) {
    $("#frameslider").slider("value", frames.length-1);
    displayFrame(frames.length-1);
  } else {
    updateInfo();
  }
}

/**
 * Dump layer tree
 * @param {string} jsonTxt JSON string
 */
function DumpLayerTree(jsonTxt) {
  var d = $("<div>").addClass("layers-dump");
  var string = "";
  var tree = JSON.parse(jsonTxt);

  for (var i = 0; i < tree.length; ++i) {
    var t = tree[i];
    string += "<li>";
    string += nameMap[t.type] + ", (" + hex8(t.ptr.low) + ") (parent: " + hex8(t.parentPtr.low) + ") ";
    if (t.visible) {
      string += "(" + t.width + ", " + t.height + ")";
    } else {
      string += "[non visible]";
    }
    string += "</li>";
  }

  d.append($("<ul>" + string + "</ul>"));

  // append to layerdump div
  $("#layerdump").empty();
  $("#layerdump").append(d);
}

/**
 * Add frame information with html tag and display it
 * @param {number} frameIndex
 */
function displayFrame(frameIndex) {
  $("#framedisplay").empty();

  updateInfo(frameIndex);

  if (frameIndex >= frames.length)
    return;

  currentFrameIndex = frameIndex;
  var frame = frames[frameIndex];

  if (frame.layers) {
    DumpLayerTree(frame.layers);
  }

  for (var i = 0; i < frame.textures.length; ++i) {
    var d = $("<div>").addClass("texture-pane");
    var t = frame.textures[i];

    d.append($("<p>" + t.name + " &mdash; " +
          GLEnumNames[t.target] + " &mdash; "
          + t.width + "x" + t.height + "</p>").addClass("texture-info"));

    if (t.layerRef) {
      d.append($("<p>Layer " + hex8(t.layerRef.low) + "</p>").addClass("texture-misc-info"));
    }

    if (t.imageData) {
      var cs = $("<canvas>").addClass("texture-canvas").addClass("background-" + frameBackground)[0];
      cs.width = t.width;
      cs.height = t.height;
      var cx = cs.getContext("2d");
      cx.putImageData(t.imageData, 0, 0);
      d.append(cs);
    }
    $("#framedisplay").append(d);
  }

  for (var i = 0; i < frame.colors.length; ++i) {
    var d = $("<div>").addClass("layer-pane");
    var l = frame.colors[i];

    d.append($("<p>" + l.type + " Layer " + hex8(l.layerRef.low) + " &mdash; " +
          + l.width + "x" + l.height + "</p>").addClass("layer-info"));

    if (l.type == "Color") {
      var bgdiv = $("<div>").addClass("layer-canvas").addClass("background-" + frameBackground);
      var colordiv = $("<div>").width(l.width).height(l.height).css("background-color", rgbaToCss(l.color));
      bgdiv.append(colordiv);
    }

    d.append(bgdiv);
    $("#framedisplay").append(d);
  }
}

/**
 * Convert raw data buffer into a image
 * @param {ArrayBuffer} data The raw ArrayBuffer
 * @param {object} texData Texture data object
 * @return {object} Image data
 */
function createImage(data, texData) {
  var texImageData = null;
  var srcData = new Uint8Array(data);
  var hash = null; // sha1.hash(srcData);

  if (hash && hash in imageCache) {
    texImageData = imageCache[hash];
  } else if (texData.width > 0 && texData.height > 0) {
    if ((texData.dataFormat >> 16) & 1) {
      // it's lz4 compressed
      var dstData = new Uint8Array(texData.stride * texData.height);
      var rv = LZ4_uncompressChunk(srcData, dstData);
      if (rv < 0)
        console.log("uncompression error at: ", rv);
      srcData = dstData;
    }

    // now it's uncompressed
    texImageData = gCanvasCx.createImageData(texData.width, texData.height);
    if (texData.stride == texData.width * 4) {
      texImageData.data.set(srcData);
    } else {
      var dstData = texImageData.data;
      for (var j = 0; j < texData.height; j++) {
        for (var i = 0; i < texData.width; i++) {
          dstData[j*texData.width*4 + i*4 + 0] = srcData[j*texData.stride + i*4 + 0];
          dstData[j*texData.width*4 + i*4 + 1] = srcData[j*texData.stride + i*4 + 1];
          dstData[j*texData.width*4 + i*4 + 2] = srcData[j*texData.stride + i*4 + 2];
          dstData[j*texData.width*4 + i*4 + 3] = srcData[j*texData.stride + i*4 + 3];
        }
      }
    }

    if (hash)
      imageCache[hash] = texImageData;
  }

  return texImageData;
}

/**
 * Process data buffer by google protocol buffer
 * @param {ByteBuffer} buffer The data buffer from google protocol buffer
 */
function processData(buffer) {
  try {
    var p = Packet.decode(buffer);
    switch(p.type) {
      case Packet.DataType.FRAMESTART:
        ll("FRAMESTART packet");
        if (receivingFrame) {
          processFrame(receivingFrame);
          receivingFrame = null;
        }

        if (p.frame != null) {
          ensureReceivingFrame(p.frame.value);
        }
        break;

      case Packet.DataType.FRAMEEND:
        ll("FRAMEEND packet");
        processFrame(receivingFrame);
        receivingFrame = null;
        break;

      case Packet.DataType.COLOR:
        ll("COLOR packet");
        ensureReceivingFrame();
        if (p.color != null) {
          var c = p.color;
          var colorData = {
            type: "Color",
            color: c.color,
            width: c.width,
            height: c.height,
            layerRef: {low: c.layerref.getLowBitsUnsigned(),
                       high: c.layerref.getHighBitsUnsigned()}
          };
          receivingFrame.colors.push(colorData);
        }
        break;

      case Packet.DataType.TEXTURE:
        ll("TEXTURE Packet");
        ensureReceivingFrame();
        if (p.texture != null) {
          var t = p.texture;
          var texData = {
            name: t.name,
            width: t.width,
            height: t.height,
            stride: t.stride,
            target: t.target,
            dataFormat: t.dataformat,
            layerRef: {low: t.layerref.getLowBitsUnsigned(),
                       high: t.layerref.getHighBitsUnsigned()},
            contextRef: t.glcontext
          };
          var buf = t.data.toArrayBuffer();
          texData.imageData = createImage(buf, texData);
          receivingFrame.textures.push(texData);
        }
        break;
      case Packet.DataType.LAYERS:
        ll("Layer Tree (Layers Dump)");
        ensureReceivingFrame();
        if (p.layers != null) {
          var l = p.layers;
          var layerTree = [];
          for (var i = 0; i < l.layer.length; ++i) {
            var data = l.layer[i];
            var node = {
              type: data.type,
              ptr: {low: data.ptr.getLowBitsUnsigned(),
                    high: data.ptr.getHighBitsUnsigned()},
              parentPtr: {low: data.parentptr.getLowBitsUnsigned(),
                          high: data.parentptr.getHighBitsUnsigned()},
              width: data.width,
              height: data.height,
              visible: !!data.visible
            };
            layerTree.push(node);
          }
          receivingFrame.layers = JSON.stringify(layerTree);
        }
        break;

      default:
        console.log("error: unknown packet type");
    }
  } catch (e) {
    console.log("decode error");
  }
}

/**
 * Handle socket message
 * @param {MessageEvent} ev The message event
 */
function onSocketMessage(ev) {
  var data = ev.data;
  ll("socket data: " + data.byteLength);

  var bytebuf = dcodeIO.ByteBuffer.wrap(data);
  processData(bytebuf);

  ll("finished processing, offset now: " + bytebuf.offset + ", buffer limit: " + bytebuf.limit);
};

$(function() {

  $("#bkgselect").change(function() {
    var val = $(this).val().toLowerCase();
    if (val != frameBackground) {
      frameBackground = val;
      displayFrame(currentFrameIndex);
    }
  });

  var canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  gCanvasCx = canvas.getContext("2d");

  $("#connect").click(function() {
    var url = $("#urlfield")[0].value;

    if (socket) {
      socket.close();
      $("#connect").text("Connect");
      $("#infomsg").empty();
      socket = null;
      leftover = null;
      receivingFrame = null;
      return;
    }

    var urlinfo = parseURL(url);
    if (urlinfo.protocol.toLowerCase() == "ws") {
      socket = new WebSocket(url, 'binary');
      socket.binaryType = "arraybuffer";
      socket.onerror = function(ev) {
        $("#infomsg").attr("class", "info-error").html("Connection failed.");
        socket = null;
      };
      socket.onopen = function(ev) {
        $("#infomsg").attr("class", "info-ok").html("Connected.");
        $("#connect").text("Disconnect");
      };
      socket.onmessage = onSocketMessage;
    } else {
      alert("protocol " + urlinfo.protocol + " not implemented");
    }
  });

  $("#frameslider").slider({
    value: 0,
    min: 0,
    max: 0,
    step: 1,
    slide: function(event, ui) {
      var frame = ui.value;
      displayFrame(ui.value);
    }
  });

  updateInfo();

  if ('RecordedData' in window) {
    var recIndex = 0;
    var sendOneChunk = function() {
      var chunk = RecordedData[recIndex++];
      onSocketMessage({ data: chunk.buffer });
      if (recIndex < RecordedData.length)
        setTimeout(sendOneChunk, 0);
    };
    setTimeout(sendOneChunk, 0);
  }

});
