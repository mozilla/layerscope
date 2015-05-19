/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 *  * License, v. 2.0. If a copy of the MPL was not distributed with this
 *   * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

// GL Texture name
const GL_TEXTURE_2D = 0x0DE1;
const GL_TEXTURE_EXTERNAL = 0x8D65;
const GL_TEXTURE_RECTANGLE = 0x84F5;

GLEnumNames = {}
GLEnumNames[GL_TEXTURE_2D] = "TEXTURE_2D";
GLEnumNames[GL_TEXTURE_EXTERNAL] = "TEXTURE_EXTERNAL";
GLEnumNames[GL_TEXTURE_RECTANGLE] = "TEXTURE_RECTANGLE";

// To draw a heat map, we don't care about
// 1. mask.
// 2. color and texture.
var heatMapVS = "\
uniform mat4 uMatrixProj;\
uniform vec4 uLayerRects[4];\
uniform mat4 uLayerTransform;\
uniform vec4 uRenderTargetOffset;\
\
attribute vec4 aCoord;\
\
void main() {\
  int vertexID = int(aCoord.w);\
  vec4 layerRect = uLayerRects[vertexID];\
  vec4 finalPosition = vec4(aCoord.xy * layerRect.zw + layerRect.xy, 0.0, 1.0);\
  finalPosition = uLayerTransform * finalPosition;\
  finalPosition.xyz /= finalPosition.w;\
  finalPosition = finalPosition - uRenderTargetOffset;\
  finalPosition.xyz *= finalPosition.w;\
  finalPosition = uMatrixProj * finalPosition;\
  gl_Position = finalPosition;\
}\
";

var heatMapFS = "\
precision mediump float;\
\
void main(void) {\
  gl_FragColor = vec4(1.0, 1.0, 1.0, 0.2);\
}";

var boundaryVS = "\
  attribute vec3 a_position;\
  uniform vec4 u_color;\
  uniform mat4 uMatrixMV;\
  uniform mat4 uMatrixProj;\
  void main(void) {\
    gl_Position = uMatrixProj * uMatrixMV * vec4(a_position, 1.0);\
  }\
";

var boundaryFS = "\
  precision highp float;\
  uniform vec4 u_color;\
  void main(void) {\
    gl_FragColor = u_color;\
  }\
";

LayerScope.DrawTesting = false;
LayerScope.DrawLog = false;

LayerScope.ThreeDViewImp = {
  gl: null,
  program: null,
  positionBuffer: null,
  quadVBO: null,
  layerProgram: null,
  bonudaryProgram: null,

  layerSelection: function THD_layerSelection(className) {

  },

  input: function TDV_input(frame) {
    var gl = this.gl;

    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    // Clear color
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); 

    // Setup project matrix, uMatrixProj.
    // Gopy the logic from CompositorOGL::PrepareViewport:
    //   https://dxr.mozilla.org/mozilla-central/source/gfx/layers/opengl/CompositorOGL.cpp
    // TBD: 
    //   1. Do we need to evaluate this martix every time? 
    //   2. Do we need to accumulate CompositorOGL::mRenderOffset?
    // Need to accumulate render offset.
    var uMatrixProj = mat4.create();
    mat4.identity(uMatrixProj);
    mat4.translate(uMatrixProj, [-1.0, 1.0, 0]);
    //mat4.scale(uMatrixProj, [2.0 / gl.viewportWidth, 2.0 / gl.viewportHeight, 1.0]);
    mat4.scale(uMatrixProj, [1.0 / gl.viewportWidth, 1.0 / gl.viewportHeight, 1.0]);
    mat4.scale(uMatrixProj, [1.0, -1.0, 0]); // flip
    uMatrixProj[10] = 0.0; // project to (z=0) plane.
    gl.useProgram(this.layerProgram);
    gl.uniformMatrix4fv(this.layerProgram.uMatrixProj, false, uMatrixProj);
    gl.useProgram(this.boundaryProgram);
    gl.uniformMatrix4fv(this.boundaryProgram.uMatrixProj, false, uMatrixProj);

    if (frame == undefined && LayerScope.DrawTesting) {
      fakeData();
    };

    self = this;
    function drawLayers(gl, drawCall) {
      for (let draw of frame.draws) {
        // Matrix4x4.
        var uLayerTransform = new Float32Array(draw.mvMatrix);
        var uRenderTargetOffset = new Float32Array([draw.offsetX, draw.offsetY, 0.0, 0.0]);
        // Sender may not always send an array with 16 items.
        var uLayerRects = new Float32Array(16);
        draw.layerRect.forEach(function (element, index) {
          uLayerRects[index * 4] = element.x;
          uLayerRects[index * 4 + 1] = element.y;
          uLayerRects[index * 4 + 2] = element.w;
          uLayerRects[index * 4 + 3] = element.h;
        });
        console.assert(draw.totalRects > 0 && draw.totalRects <= 4);
        drawCall.apply(self, [gl, uLayerTransform, uRenderTargetOffset, uLayerRects, draw.totalRects]);
      }
    }

    // Draw quads.
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    drawLayers(gl, this._drawQuad);

    // Draw a boundary around each quad.
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.useProgram(this.boundaryProgram);
    gl.lineWidth(1.0);
    drawLayers(gl, this._drawBoundary);
  },

  _drawQuad: function TDV_drawQuad(gl, uMatrixMV, uRenderTargetOffset, uLayerRects, quads) {
    gl.useProgram(this.layerProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.vertexAttribPointer(this.layerProgram.aCoord, 4, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(this.layerProgram.uLayerTransform, false, uMatrixMV);
    gl.uniform4fv(this.layerProgram.uRenderTargetOffset, uRenderTargetOffset);
    gl.uniform4fv(this.layerProgram.uLayerRects, uLayerRects);

    gl.drawArrays(gl.TRIANGLES, 0, 6 * quads);
  },

  _drawBoundary: function TDV_drawBoundary(gl, uMatrixMV, uRenderTargetOffset, uLayerRects) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boundaryProgram.vb)
    gl.bufferData(gl.ARRAY_BUFFER, 
      new Float32Array(
        [uLayerRects[0], uLayerRects[1], 0, 
         uLayerRects[0]+ uLayerRects[2], uLayerRects[1], 0, 
         uLayerRects[0]+ uLayerRects[2], uLayerRects[1] + uLayerRects[3], 0,
         uLayerRects[0], uLayerRects[1] + uLayerRects[3], 0]), 
      gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.boundaryProgram.ib);
    gl.vertexAttribPointer(this.boundaryProgram.position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.boundaryProgram.position);

    gl.uniformMatrix4fv(this.boundaryProgram.uMatrixMV, false, uMatrixMV);
    gl.uniform4f(this.boundaryProgram.uColor, 1.0, 0.0, 0.0, 1.0);

    gl.drawElements(gl.LINE_STRIP, 4, gl.UNSIGNED_SHORT, 0);

    if (LayerScope.DrawLog) {
      console.log("uMatrixMV 1= " + uMatrixMV[0] + "," + uMatrixMV[1] + "," + uMatrixMV[2] + ","+ uMatrixMV[3]+ "," + uMatrixMV[4] + "," + uMatrixMV[5] + "," + uMatrixMV[6] + ","+ uMatrixMV[7] + "," + uMatrixMV[8] + "," + uMatrixMV[9] + "," + uMatrixMV[10] + ","+ uMatrixMV[11]+ "," + uMatrixMV[12] + "," + uMatrixMV[13] + "," + uMatrixMV[14] + ","+ uMatrixMV[15]);
      console.log("x = " + uLayerRects[0] + ". y = "+ uLayerRects[1] + ". w = " + uLayerRects[2] +". h = " + uLayerRects[3]);
    }
  },

  deactive: function TDV_deactive($panel) {
    $panel.empty();
  },

  active: function TDV_active($panel) {
    var $canvas = $("<canvas>")
    .css('width', '100%')
    .css('height', '100%')
      //.attr('width', '200')
      //.attr('height', '200')
      .appendTo($panel)
      ;

    try {
      function logGLCall(functionName, args) {   
        //console.log("gl." + functionName + "(" + 
        //WebGLDebugUtils.glFunctionArgsToString(functionName, args) + ")");   
      } 
      var gl = $canvas[0].getContext("experimental-webgl");
      gl = this.gl = WebGLDebugUtils.makeDebugContext(gl, undefined, logGLCall); 

      $canvas.attr('width', $canvas.width());
      $canvas.attr('height', $canvas.height());
      gl.viewportWidth = $canvas.attr('width');
      gl.viewportHeight = $canvas.attr('height');
    } catch(e) {
      alert('WebGL initialization failed...');
    }

    this._initPrograms(gl);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    // We don't need depth test in layer system.
    gl.enable(gl.BLEND);
  },

  _initPrograms: function THD_initPrograms(gl) {
    var self = this;
    // 1. The heat map program.
    this.layerProgram = this._createProgram(gl, heatMapVS, heatMapFS, function (gl, program) {
      program.uMatrixProj = gl.getUniformLocation(program, "uMatrixProj");
      program.uLayerRects = gl.getUniformLocation(program, "uLayerRects");
      program.uLayerTransform = gl.getUniformLocation(program, "uLayerTransform");
      program.uRenderTargetOffset = gl.getUniformLocation(program, "uRenderTargetOffset");
      program.aCoord = gl.getAttribLocation(program, "aCoord");
      gl.enableVertexAttribArray(program.aCoord);

      self._generateQuadVBO();
    });

    // 2. The boundary porgram.
    this.boundaryProgram = this._createProgram(gl, boundaryVS, boundaryFS, function (gl, program) {
      program.uMatrixProj = gl.getUniformLocation(program, "uMatrixProj"); 
      program.uMatrixMV = gl.getUniformLocation(program, "uMatrixMV"); 
      program.uColor = gl.getUniformLocation(program, "u_color"); 
      program.vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, program.vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([10, 10, 0, 1000, 1000, 0]), gl.STATIC_DRAW);
      program.ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, program.ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 3, 0]), gl.STATIC_DRAW);
      program.position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(program.position);
    });
  },

  _createProgram: function THD_createProgram(gl, vsSource, fsSource, callback) {
    var vs = this._compileShader(vsSource, gl.VERTEX_SHADER);
    var fs = this._compileShader(fsSource, gl.FRAGMENT_SHADER);
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      alert("Could not initialise shaders");
    }

    callback(gl, program);
    return program;
  },

  _compileShader: function THD_compileShader(code, type) {
    var gl = this.gl;
    var shader = gl.createShader(type);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(shader));
      return null;
    } 

    return shader;
  },

  _generateQuadVBO: function THD_generateQuadVBO() {
    var gl = this.gl;
    
    //  Copy the logic from CompositorOGL::Initialize
    //    https://dxr.mozilla.org/mozilla-central/source/gfx/layers/opengl/CompositorOGL.cpp
    this.quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);

    // 4 quads, with the number of the quad (vertexID) encoded in w.
    var vertices = [
    0.0, 0.0, 0.0, 0.0,
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    1.0, 1.0, 0.0, 0.0,

    0.0, 0.0, 0.0, 1.0,
    1.0, 0.0, 0.0, 1.0,
    0.0, 1.0, 0.0, 1.0,
    1.0, 0.0, 0.0, 1.0,
    0.0, 1.0, 0.0, 1.0,
    1.0, 1.0, 0.0, 1.0,

    0.0, 0.0, 0.0, 2.0,
    1.0, 0.0, 0.0, 2.0,
    0.0, 1.0, 0.0, 2.0,
    1.0, 0.0, 0.0, 2.0,
    0.0, 1.0, 0.0, 2.0,
    1.0, 1.0, 0.0, 2.0,

    0.0, 0.0, 0.0, 3.0,
    1.0, 0.0, 0.0, 3.0,
    0.0, 1.0, 0.0, 3.0,
    1.0, 0.0, 0.0, 3.0,
    0.0, 1.0, 0.0, 3.0,
    1.0, 1.0, 0.0, 3.0,
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  },

  // Use for testing only. Remove this fumction later.
  fakeData: function THD_fakeData(frame) {
    frame = {};
    var node1 = {};
    node1.mvMatrix = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
    ];
    node1.offsetX = 0.0;
    node1.offsetY = 0.0;
    node1.totalRects = 1;
    node1.layerRect = [
    // x, y, width, height
    {x:0.0, y:0.0, w:256.0, h:256.0}
    ];

    var node2 = {};
    node2.mvMatrix = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
    ];
    node2.offsetX = 0.0;
    node2.offsetY = 0.0;
    node2.totalRects = 1;
    node2.layerRect = [
    {x:0.0, y:.0, w:256.0, h:208.0}
    ];

    var node3 = {};
    node3.mvMatrix = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
    ];
    node3.offsetX = 0.0;
    node3.offsetY = 0.0;
    node3.totalRects = 1;
    node3.layerRect = [
    // x, y, width, height
    400.0, 120.0, 400.0, 100.0,
    ];      

    var node4 = {};
    node4.mvMatrix = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
    ];
    node4.offsetX = 0.0;
    node4.offsetY = 0.0;
    node4.totalRects = 1;
    node4.layerRect = [
    // x, y, width, height
    500.0, 130.0, 100.0, 10.0,
    ]; 

    //frame.textureNodes = [node1, node2, node3, node4];
    frame.draws = [node1]; 
  }
};

LayerScope.TwoDViewImp = {
  _$panel: null,

  layerSelection: function TWD_layerSelection(className) {
    $(".selected-sprite").removeClass("selected-sprite");
    var $sprites = $("." + className).addClass("selected-sprite");
    if ($sprites.length == 0) {
      return;
    }

    // Scroll to those sprite.
    var top = $("#texture-container").scrollTop() + $sprites.position().top;
    $("#texture-container").animate({scrollTop:top}, '500', 'swing');
  },

  active: function TWD_active($panel) {
    this._$panel = $panel;
  },

  deactive: function TWD_deactive($panel) {
    $panel.empty();
  },

  input: function TDV_input(frame) {
    this._$panel.empty();

    this._drawTextureLayer(frame, this._$panel);
    this._drawColorLayer(frame, this._$panel);
  },

  _drawTextureLayer: function TWD_drawTextureLayer(frame, $panel) {
    for (let texNode of frame.textureNodes) {
      let imageData = LayerScope.LayerBufferRenderer._graph.findImage(texNode.texID);

      if (imageData === undefined) {
        //TODO
        //Show link broken image.
        continue;
      }

      let $sprite = $("<div>").addClass("buffer-sprite")
      .addClass(texNode.layerRef.low.toString());

      // name + target + size.
      let $title = $("<div>").addClass("sprite-title");
      $sprite.append($title);
      $title.append($("<p>" + texNode.name + " &mdash; " +
       GLEnumNames[texNode.target] + " &mdash; "
       + imageData.width + "x" + imageData.height + "</p>"));

      // layer ID.
      let layerID = null;
      if (texNode.layerRef) {
        layerID = texNode.layerRef.low;
        $sprite.attr("data-layer-id", layerID.toString());
        $title.append($("<p>Layer " + LayerScope.utils.hex8(layerID) + "</p>"));
      }

      if (!!layerID){
        $sprite.on("click", function() {
          LayerScope.MessageCenter.fire("buffer.select",
            layerID.toString());
        });
      }

      // Draw image.
      let cs = this._createCanvas(imageData);
      $sprite.append(cs);

      // Last step, append this new sprite.
      $panel.append($sprite);
    }
  },

  _createCanvas: function TWD_createCanvas(imageData) {
    let cs = $("<canvas>").addClass("background-" +
      LayerScope.Config.background)[0];
    cs.width = imageData.width;
    cs.height = imageData.height;
    let cx = cs.getContext("2d");
    cx.putImageData(imageData, 0, 0);

    let ratio = LayerScope.Config.ratio / 100;
    if (ratio != 100) {
      let zoomedcs = $("<canvas>").addClass("background-" +
        LayerScope.Config.background)[0];
      let zoomedcx = zoomedcs.getContext("2d");
      zoomedcs.width = imageData.width * ratio;
      zoomedcs.height = imageData.height * ratio;
      zoomedcx.scale(ratio, ratio);
      zoomedcx.drawImage(cs,0, 0);
      return zoomedcs;
    }

    return cs;
  },

  _drawColorLayer: function TWD_drawColoerLayer(frame, $panel) {
    for (let o of frame.colors) {
      let $sprite = $("<div>").addClass("buffer-sprite")
      .addClass(o.layerRef.low.toString());

      let $title = $("<div>").addClass("sprite-title");
      $sprite.append($title);
      $title.append($("<p>" + o.type + " Layer " +
       LayerScope.utils.hex8(o.layerRef.low) +
       " &mdash; " + o.width + "x" + o.height + "</p>"));
      let layerID = o.layerRef.low;
      $title.attr("data-layer-id", layerID.toString());

      if (o.type == "Color") {
        let ratio = LayerScope.Config.ratio / 100;
        var $bgdiv = $("<div>").addClass("background-" + LayerScope.Config.background);
        let colordiv = $("<div>").width(o.width * ratio).height(o.height * ratio)
        .css("background-color", LayerScope.utils.rgbaToCss(o.color));
        $bgdiv.append(colordiv);
      }

      $sprite.on("click", function() {
        LayerScope.MessageCenter.fire("buffer.select", layerID.toString());
      });

      $sprite.append($bgdiv);
      $panel.append($sprite);
    }
  }
};

LayerScope.LayerBufferRenderer = {
  _view: null,
  _graph: null,

  init: function TR_init(graph) {
    this._graph = graph; 

    this._view = LayerScope.ThreeDViewImp;

    LayerScope.MessageCenter.subscribe("layer.select", this);
    LayerScope.MessageCenter.subscribe("buffer.view", this);

    // test code.
    if (LayerScope.DrawTesting) {
      this.begin();
      this.input();
    }
  },

  notify: function LR_notify(name, value) {
    if (name == "layer.select") {
      this._view.layerSelection(value);
    } else if (name == "buffer.view") {
      this._view.deactive($("#texture-container"));
      this._view =  (this._view == LayerScope.ThreeDViewImp) ? 
      LayerScope.TwoDViewImp : LayerScope.ThreeDViewImp;
      this._view.active($("#texture-container"));
    }
  },

  begin: function LR_begin() {
    $("#texture-container").empty();
    this._view.active($("#texture-container"));
  },
  end: function LR_end() {

  },

  input: function LR_input(frame) {
    this._view.input(frame);
  }
};

// Regist LayerBufferRenderer into RendererNode
LayerScope.RendererNode.register(LayerScope.LayerBufferRenderer);