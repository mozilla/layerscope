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
    return;

    if (lines++ > 500)
	return;

    $("#log").append($("<span>" + s + "</span><br>"));
}

function pad0(s, cnt) {
    while (s.length < cnt) {
	s = "0" + s;
    }
    return s;
}

function clearFrames() {
    frames = [];
    imageCache = {};

    $("#frameslider").slider("value", 0);
    $("#frameslider").slider("option", "min", 0);
    $("#frameslider").slider("option", "max", 0);
}

function updateInfo(findex) {
    if (findex === undefined)
	findex = $("#frameslider").slider("value");
    if (frames.length == 0) {
	$("#info").html("<span>No frames.</span>");
    } else {
	$("#info").html("<span>Frame " + findex + "/" + (frames.length-1) + " &mdash; stamp: 0x" + pad0(frames[findex].idHigh.toString(16), 8) + pad0(frames[findex].idLow.toString(16), 8) + "</span>");
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

    for (var i = 0; i <frame.textures.length; ++i) {
	var d = $("<div>").addClass("texture-pane");
	var t = frame.textures[i];

	d.append($("<p>" + t.name + " &mdash; " +
		   GLEnumNames[t.target] + " &mdash; "
		   + t.width + "x" + t.height + "</p>").addClass("texture-info"));

	if (t.layerRef) {
	    d.append($("<p>Layer 0x" + pad0(t.layerRef.toString(16), 8) + "</p>").addClass("texture-misc-info"));
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
	    if (receivingFrame) {
		processFrame(receivingFrame);
		receivingFrame = null;
	    }

	    if (left < 20)
		break;

	    var valueLow = u32[3];
	    var valueHigh = u32[4];

            receivingFrame = {
		idHigh: valueHigh,
		idLow: valueLow,
                textures: []
            };

            pd.offset += 20;
            rv = true;
        }
        break;

        case DATA_TYPE_FRAME_END: {
	    if (left < 20)
		break;

            processFrame(receivingFrame);
            receivingFrame = null;

            pd.offset += 20;
            rv = true;
        }
        break;

        case DATA_TYPE_TEXTURE_DATA: {
            // 32:type 64:ptr 64:layerref 32:name 32:width 32:height 32:stride 32:format 32:target 32:dataFormat  32:size
	    if (receivingFrame == null) {
		receivingFrame = {
		    idHigh: valueHigh,
		    idLow: valueLow,
                    textures: []
		};
	    }

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
	return;
    }

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
