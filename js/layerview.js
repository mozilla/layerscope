var GL_TEXTURE_2D = 0x0DE1;
var GL_TEXTURE_EXTERNAL = 0x8D65;
var GL_TEXTURE_RECTANGLE = 0x84F5;

var GLEnumNames = {};
GLEnumNames[GL_TEXTURE_2D] = "TEXTURE_2D";
GLEnumNames[GL_TEXTURE_EXTERNAL] = "TEXTURE_EXTERNAL";
GLEnumNames[GL_TEXTURE_RECTANGLE] = "TEXTURE_RECTANGLE";

var DATA_TYPE_FRAME_START = 0;
var DATA_TYPE_FRAME_END = 1;
var DATA_TYPE_TEXTURE_DATA = 2;
var DATA_TYPE_COLOR_DATA = 3;

var MIN_FRAME_SIZE = 12;

var frames = [];
var currentFrameIndex = 0;
var imageCache = {};
var frameBackground = "pattern";

var socket;
var leftover = null;
var receivingFrame = null;

var gCanvasCx;

var lines = 0;
function ll(s) {
    //console.log(s);
    return;

    if (lines++ > 500)
	return;

    $("#log").append($("<span>" + s + "</span><br>"));
}

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

function pad0(s, cnt) {
    while (s.length < cnt) {
	s = "0" + s;
    }
    return s;
}

function hex8(val) {
    return "0x" + pad0(val.toString(16), 8);
}

function hex16(vh, vl) {
    return "0x" + pad0(vh.toString(16), 8) + pad0(vl.toString(16), 8);
}

function rgbaToCss(val) {
    // the value is abgr, little-endian packed
    var r = val & 0xff;
    var g = (val >>> 8) & 0xff;
    var b = (val >>> 16) & 0xff;
    var a = (val >>> 24) & 0xff;

    return "rgba(" + r + "," + g + "," + b + "," + a/255.0 + ")";
}

function clearFrames() {
    frames = [];
    imageCache = {};

    $("#frameslider").slider("value", 0);
    $("#frameslider").slider("option", "min", 0);
    $("#frameslider").slider("option", "max", 0);
}

function ensureReceivingFrame(vh, vl) {
    if (receivingFrame)
	return;

    receivingFrame = {
	idHigh: vh || 0,
	idLow: vl || 0,
        textures: [],
	layers: []
    };
}

function updateInfo(findex) {
    if (findex === undefined)
	findex = $("#frameslider").slider("value");
    if (frames.length == 0) {
	$("#info").html("<span>No frames.</span>");
    } else {
	$("#info").html("<span>Frame " + findex + "/" + (frames.length-1) + " &mdash; stamp: " + hex16(frames[findex].idHigh, frames[findex].idLow) + "</span>");
    }
}

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

function displayFrame(frameIndex) {
    $("#framedisplay").empty();

    updateInfo(frameIndex);

    if (frameIndex >= frames.length)
	return;

    currentFrameIndex = frameIndex;
    var frame = frames[frameIndex];

    for (var i = 0; i < frame.textures.length; ++i) {
	var d = $("<div>").addClass("texture-pane");
	var t = frame.textures[i];

	d.append($("<p>" + t.name + " &mdash; " +
		   GLEnumNames[t.target] + " &mdash; "
		   + t.width + "x" + t.height + "</p>").addClass("texture-info"));

	if (t.layerRef) {
	    d.append($("<p>Layer " + hex8(t.layerRef) + "</p>").addClass("texture-misc-info"));
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

    for (var i = 0; i < frame.layers.length; ++i) {
	var d = $("<div>").addClass("layer-pane");
	var l = frame.layers[i];

	d.append($("<p>" + l.type + " Layer " + hex8(l.layerRef) + " &mdash; " +
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

function processData(pd) {
    var left = pd.data.byteLength - pd.offset;
    if (left < MIN_FRAME_SIZE)
        return false;

    if (pd.offset % 4 != 0)
        throw "Logic error: expected offset to always be a multiple of 4";

    // protect against fragmentation on the wire
    var size = pd.data.byteLength - pd.offset;
    size -= size % 4;
    var u32 = new Uint32Array(pd.data, pd.offset, size / 4);

    var dataType = u32[0];
    var ptrLow = u32[1];
    var ptrHigh = u32[2];

    var rv = false;

    ll("processData - offset: " + pd.offset + " dataType: " + dataType + " ptrLow: " + ptrLow);

    switch (dataType) {
        case DATA_TYPE_FRAME_START: {
	    ll("FRAME_START");
	    if (receivingFrame) {
		processFrame(receivingFrame);
		receivingFrame = null;
	    }

	    if (left < 20)
		break;

	    var valueLow = u32[3];
	    var valueHigh = u32[4];

	    ensureReceivingFrame(valueHigh, valueLow);

            pd.offset += 20;
            rv = true;
        }
        break;

        case DATA_TYPE_FRAME_END: {
	    ll("FRAME_END");
	    if (left < 20)
		break;

            processFrame(receivingFrame);
            receivingFrame = null;

            pd.offset += 20;
            rv = true;
        }
        break;

        case DATA_TYPE_COLOR_DATA: {
	    ll("COLOR_DATA");
	    ensureReceivingFrame();

	    // 32:type 64:ptr 64:layerref 32:abgr 32:width 32:height
            var headerSize = 12 + 8 + 4 + 4 + 4;
            if (left < headerSize)
                break;

	    var layerRefLow = u32[3];
	    var layerRefHigh = u32[4];
            var color = u32[5];
	    var width = u32[6];
	    var height = u32[7];

	    var colorData = {
		type: "Color",
		color: color,
		width: width,
		height: height,
		layerRef: layerRefLow
	    };

	    receivingFrame.layers.push(colorData);

	    pd.offset += headerSize;
	    rv = true;
	}
	break;

        case DATA_TYPE_TEXTURE_DATA: {
	    ll("TEXTURE_DATA");
	    ensureReceivingFrame();

            // 32:type 64:ptr 64:layerref 32:name 32:width 32:height 32:stride 32:format 32:target 32:dataFormat  32:size
            var headerSize = 12 + 10*4;
            if (left < headerSize)
                break;

	    var layerRefLow = u32[3];
	    var layerRefHigh = u32[4];
            var texName = u32[5];
            var texWidth = u32[6];
            var texHeight = u32[7];
            var texStride = u32[8];
            var texFormat = u32[9];
            var texTarget = u32[10];
            var texDataFormat = u32[11];
            var texDataSize = u32[12];

	    // account for padding when deciding 
	    var bytesToConsume = headerSize + texDataSize;
            if (bytesToConsume % 4 > 0)
                bytesToConsume += 4 - texDataSize % 4;

	    ll("texture_data expecting " + texWidth + "x" + texHeight + " -- bytes: " + (headerSize + bytesToConsume));

            if (left < bytesToConsume)
                break;

            var texImageData = null;
	    var srcData = new Uint8Array(pd.data, pd.offset + headerSize, texDataSize);
	    var hash = null; // sha1.hash(srcData);

	    if (hash && hash in imageCache) {
		texImageData = imageCache[hash];
	    } else if (texWidth > 0 && texHeight > 0) {
		if ((texDataFormat >> 16) & 1) {
		    // it's lz4 compressed
		    var dstData = new Uint8Array(texStride * texHeight);
		    var rv = LZ4_uncompressChunk(srcData, dstData);
		    if (rv < 0)
			console.log("compression error at: ", rv);
		    srcData = dstData;
		}

		// now it's uncompressed
                texImageData = gCanvasCx.createImageData(texWidth, texHeight);
                if (texStride == texWidth * 4) {
		    texImageData.data.set(srcData);
                } else {
		    var dstData = texImageData.data;
		    for (var j = 0; j < texHeight; j++) {
                        for (var i = 0; i < texWidth; i++) {
			    dstData[j*texWidth*4 + i*4 + 0] = srcData[j*texStride + i*4 + 0];
			    dstData[j*texWidth*4 + i*4 + 1] = srcData[j*texStride + i*4 + 1];
			    dstData[j*texWidth*4 + i*4 + 2] = srcData[j*texStride + i*4 + 2];
			    dstData[j*texWidth*4 + i*4 + 3] = srcData[j*texStride + i*4 + 3];
                        }
		    }
                }

		if (hash)
		    imageCache[hash] = texImageData;
	    }

            var texData = {
                name: texName,
                width: texWidth,
                height: texHeight,
                format: texFormat,
		target: texTarget,
                imageData: texImageData,
		layerRef: layerRefLow,
		contextRef: ptrLow
            };

            receivingFrame.textures.push(texData);

            pd.offset += bytesToConsume;
            rv = true;
        }
        break;
    }

    return rv;
}

function onSocketMessage(ev) {
    var data = ev.data;
    ll("socket data: " + data.byteLength);

    if (leftover && leftover.length > 0) {
        // Ugh, we have some leftovers that we didn't read before.  This is a horribly
        // inefficient implementation of fragmentation joining, but I don't care.
        var newab = new ArrayBuffer(leftover.length + data.byteLength);

        var data8 = new Uint8Array(data);
        var out8 = new Uint8Array(newab);

        out8.set(leftover, 0);
        out8.set(data8, leftover.byteLength);

        data = newab;
        leftover = null;
    }

    // now we can attempt to process data
    if (data.byteLength < MIN_FRAME_SIZE) {
        // can't even try.
        leftover = data;
        return;
    }

    var pd = {
        data: data,
        offset: 0
    };

    while (processData(pd)) {
        // keep going
    }

    ll("finished processing, offset now: " + pd.offset + " data.byteLength: " + data.byteLength);
    if (pd.offset < data.byteLength) {
        // some was left over
        leftover = new Uint8Array(data.byteLength - pd.offset);
        var src8 = new Uint8Array(data, pd.offset, leftover.byteLength);
        leftover.set(src8);
    }
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
