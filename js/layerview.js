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
const gLayerNameMap = [
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

// Filter Type Map
const gFilterMap = [
  "Fast",
  "Good",
  "Best",
  "Nearest",
  "Bilinear",
  "Gaussian",
  "Sentinel"
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
  } else if (findex >= frames.length) {
    console.log("error: Frame index is out of range");
  } else {
    var stamp = frames[findex].id;
    var time = "";
    if (!!frames[findex].id) {
      time = hex16(stamp.getHighBitsUnsigned(), stamp.getLowBitsUnsigned());
    } else {
      // Special case, I should figure out why PR_Now() gave me 0.....
      time = hex16(0, 0);
    }
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
 * Handle layer attribute and show them in html
 * @param {object} data The attribute data
 * @return ul tag with attributes
 */
function showAttributes(data) {
  // Show functions wrapper
  var showAttrWrapper = {
    showClip: // Create clip info
      function(clip) {
        return $("<li>Clip: (x=" + clip.x +
                          ", y=" + clip.y +
                          ", w=" + clip.w +
                          ", h=" + clip.h + ")</li>");
      },
    showTransform: // Create transform info
      function(transform) {
        let $li = $("<li>");
        if(transform.is2D) {
          if(transform.isID) {
            $li.append("Transform: 2D Identity");
          } else {
            $li.append("Transform: [");
            for (let i=0; i<6; i+=2) {
              $li.append(transform.m[i] + ", " + transform.m[i+1] + "; ");
            }
            $li.append("]");
          }
        } else {
          $li.append("Transform:<br>");
          for (let i=0; i<16; i+=4) {
              $li.append("[" + transform.m[i]   + ", " +
                               transform.m[i+1] + ", " +
                               transform.m[i+2] + ", " +
                               transform.m[i+3] + "]<br>");
          }
        }
        return $li;
      },
    showRegion: // Create region info
      function(region, name) {
        let $li = $("<li>");
        for (let r of region) {
          $li.append(name + ": (x=" + r.x +
                             ", y=" + r.y +
                             ", w=" + r.w +
                             ", h=" + r.h + ")<br>");
        }
        return $li;
      }
  };

  // OK, Let's start to show attributes
  var $ul = $("<ul>");
  var $li = $("<li>").append("Type: " + gLayerNameMap[data.type] + "Composite");
  if (!data.parentPtr.low) {
    $li.append(" [root]");
  }
  $ul.append($li);

  // Actually, only visible layers enter this function
  if (!!data.shadow) {
    let $sli = $("<li>").append("Shadow:");
    let $sul = $("<ul>");
    if (!!data.shadow.clip) {
      $sul.append(showAttrWrapper.showClip(data.shadow.clip));
    }
    if (!!data.shadow.transform) {
      $sul.append(showAttrWrapper.showTransform(data.shadow.transform));
    }
    if (!!data.shadow.region) {
      $sul.append(showAttrWrapper.showRegion(data.shadow.region, "Visible"));
    }
    $sli.append($sul);
    $ul.append($sli);
  }

  if (!!data.clip) {
    $ul.append(showAttrWrapper.showClip(data.clip));
  }

  if (!!data.transform) {
    $ul.append(showAttrWrapper.showTransform(data.transform));
  }

  if (!!data.region) {
    $ul.append(showAttrWrapper.showRegion(data.region, "Visible"));
  }

  if (!!data.opacity) {
    $ul.append("<li>Opacity: "+ data.opacity + "</li>");
  }

  if (!!data.opaque) {
    $ul.append("<li>[Content Opaque]</li>");
  }

  if (!!data.alpha) {
    $ul.append("<li>[Content Component Alpha]</li>");
  }

  if (!!data.direct) {
    let $li = $("<li>");
    if (data.direct === LayersPacket.Layer.ScrollingDirect.VERTICAL ) {
      $li.append("VERTICAL: ");
    } else {
      $li.append("HORIZONTAL: ");
    }
    $li.append("(id: " + hex8(data.barID.low) + " )");
    $ul.append($li);
  }

  if (!!data.mask) {
    $ul.append("<li>Mask Layer: "+ hex8(data.mask) + "</li>");
  }

  // Specific layer data
  // Valid (ThebesLayer)
  if (!!data.valid) {
    $ul.append(showAttrWrapper.showRegion(data.valid, "Valid"));
  }
  // Color (ColorLayer)
  if (!!data.color) {
    $ul.append("<li>Color: " + rgbaToCss(data.color) +"</li>");
  }
  // Filter (CanvasLayer & ImageLayer)
  if (!!data.filter) {
    $ul.append("<li>Filter: " + gFilterMap[data.filter] + "</li>");
  }
  // Ref ID (RefLayer)
  if (!!data.refID) {
    $ul.append("<li>ID: " + hex8(data.refID.low) + "</li>");
  }
  // Size (ReadbackLayer)
  if (!!data.size) {
    $ul.append("<li>Size: (w=" + data.size.w +
                        ", h=" + data.size.h + ")</li>");
  }
  return $ul;
}

/**
 * highlight and unhighlight the specific layer image
 * Note: This function is used for jQuery mouseenter
 */
function highlight() {
  // Highlight text
  $(".highlight-text").removeClass("highlight-text");
  $(this).addClass("highlight-text");

  // Highligh images
  $(".highlight-pane").removeClass("highlight-pane");
  $("." + $(this).data("ptr").toString()).addClass("highlight-pane");

  // Append Attributes
  var $d = $("<div>");
  var $table = $("<table>").addClass("layerattr-table");
  var $tr = $("<tr>").addClass("layerattr-title").append("<td><strong>Layer Attributes</strong></td>");
  $table.append($tr);
  $tr = $("<tr>").append("<td><ul>" + showAttributes($(this).data("layerValue")).html() + "</ul></td>");
  $table.append($tr);
  $d.append($table);

  $("#layerattr").empty();
  $("#layerattr").append($d);
}

/**
 * Dump layer tree
 * @param {string} jsonTxt Frame tree data
 */
function dumpLayerTree(jsonTxt) {
  // DFS print
  var dfs = function(node) {
    var $span = $("<span>");

    // Store data into this tag
    $span.data("layerValue", node.value);

    // Setting
    var isRoot = !node.value.parentPtr.low;
    var invisible = !node.value.region;
    if (invisible && !isRoot) {
      $span.addClass("layer-grayout");
    } else {
      $span.data("ptr", node.value.ptr.low);
      $span.mouseenter(highlight);
    }

    // Self info
    $span.append(gLayerNameMap[node.value.type] + "(" + hex8(node.value.ptr.low) + ") ");
    if (isRoot) {
      $span.append("[root]");
    } else if (invisible) {
      $span.append("[non visible]");
    }
    var $li = $("<li>").append($span);

    // Children
    for (let child of node.children) {
      $li.append(dfs(child));
    }
    return $("<ul>").append($li);
  };

  if (!jsonTxt) {
    return;
  }

  var tree = JSON.parse(jsonTxt);
  var $d = $("<div>");
  for (let t of tree) {
    $d.append(dfs(t));
  };

  // Append to layerdump div
  $("#layertree").empty();
  $("#layertree").append($d);
  $("#layerattr").empty();
}

/**
 * Dump layer scope
 * @param {object} frame The specific frame data which contains texture or color layers
 */
function dumpLayerScope(frame) {
  var dumpTextureLayer = function(frame, $panel) {
    for (let t of frame.textures) {
      let d = $("<div>").addClass("texture-pane").addClass(t.layerRef.low.toString());

      d.append($("<p>" + t.name + " &mdash; " +
            GLEnumNames[t.target] + " &mdash; "
            + t.width + "x" + t.height + "</p>").addClass("texture-info"));

      if (t.layerRef) {
        d.append($("<p>Layer " + hex8(t.layerRef.low) + "</p>").addClass("texture-misc-info"));
      }

      if (t.imageData) {
        let cs = $("<canvas>").addClass("texture-canvas").addClass("background-" + frameBackground)[0];
        cs.width = t.width;
        cs.height = t.height;
        let cx = cs.getContext("2d");
        cx.putImageData(t.imageData, 0, 0);
        d.append(cs);
      }
      $panel.append(d);
    }
  };
  var dumpColorLayer = function(frame, $panel) {
    for (let l of frame.colors) {
      let d = $("<div>").addClass("layer-pane").addClass(l.layerRef.low.toString());

      d.append($("<p>" + l.type + " Layer " + hex8(l.layerRef.low) + " &mdash; " +
            + l.width + "x" + l.height + "</p>").addClass("layer-info"));

      if (l.type == "Color") {
        var bgdiv = $("<div>").addClass("layer-canvas").addClass("background-" + frameBackground);
        let colordiv = $("<div>").width(l.width).height(l.height).css("background-color", rgbaToCss(l.color));
        bgdiv.append(colordiv);
      }

      d.append(bgdiv);
      $panel.append(d);
    }
  };

  $("#framedisplay").empty();
  dumpTextureLayer(frame, $('#framedisplay'));
  dumpColorLayer(frame, $('#framedisplay'));
}

/**
 * Add frame information with html tag and display it
 * @param {number} frameIndex
 */
function displayFrame(frameIndex) {
  updateInfo(frameIndex);

  if (frameIndex >= frames.length)
    return;

  currentFrameIndex = frameIndex;
  var frame = frames[frameIndex];

  dumpLayerTree(frame.layers);
  dumpLayerScope(frame);
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
      let dstData = new Uint8Array(texData.stride * texData.height);
      let rv = LZ4_uncompressChunk(srcData, dstData);
      if (rv < 0)
        console.log("uncompression error at: ", rv);
      srcData = dstData;
    }

    // now it's uncompressed
    texImageData = gCanvasCx.createImageData(texData.width, texData.height);
    if (texData.stride == texData.width * 4) {
      texImageData.data.set(srcData);
    } else {
      let dstData = texImageData.data;
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
      imageCache[hash] = texImageData;
  }
  return texImageData;
}

/**
 * Reconstruct layer tree by node list
 * @param {Array} nodeList The layer dump node list
 * @return {Array} Tree root array
 */
function constructTree(nodeList) {
  var roots = [];
  var children = {}; // hash table: parent address -> children array

  // TreeNode Construct
  var treeNode = function(property) {
    this.value = property;
    this.children = [];
  };

  for (let item of nodeList) {
    let p = item.parentPtr.low;
    let target = !p ? roots : (children[p] || (children[p] = []));
    target.push(new treeNode(item));
  }

  // DFS traverse by resursion
  var findChildren = function(papa){
    if (children[papa.value.ptr.low]) {
      papa.children = children[papa.value.ptr.low];
      for (let ch of papa.children) {
        findChildren(ch);
      }
    }
  };

  for (let r of roots) {
    findChildren(r);
  }

  return roots;
}

/**
 * Create Layer Node
 * @param {object} buffer The ByteBuffer data
 * @return {object} The layer node data
 */
function createLayerNode(data) {
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
    mask: data.mask,

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
}

/**
 * Process data buffer by google protocol buffer
 * @param {ByteBuffer} buffer The data buffer from google protocol buffer
 */
function processData(buffer) {
  var p = null;
  try {
    p = Packet.decode(buffer);
  } catch (e) {
    console.log("Fatal error: Decode ByteBuffer failed! Maybe you should update the .proto file.");
    return;
  }

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
        let c = p.color;
        let colorData = {
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
        let t = p.texture;
        let texData = {
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
        let buf = t.data.toArrayBuffer();
        texData.imageData = createImage(buf, texData);
        receivingFrame.textures.push(texData);
      }
      break;

    case Packet.DataType.LAYERS:
      ll("Layer Tree (Layers Dump)");
      ensureReceivingFrame();
      if (p.layers != null) {
        let l = p.layers;
        let layerTree = [createLayerNode(layer) for (layer of l.layer)];
        receivingFrame.layers = JSON.stringify(constructTree(layerTree));
      }
      break;

    default:
      console.log("Error: Unsupported packet type. Please update this viewer.");
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
