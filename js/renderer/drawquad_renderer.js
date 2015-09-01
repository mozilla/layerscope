/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
  uniform vec4 u_color;\
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
  precision highp float;\
  uniform vec4 u_color;\
  void main(void) {\
    gl_FragColor = u_color;\
  }\
";

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
// Dump draw call information into console for debugging.
LayerScope.DrawLog = false;

LayerScope.ShaderPrograms = {
  layerProgram: null,
  boundaryProgram: null,

  create: function PS_create(gl) {
    // The heatmap program.
    var program = this.layerProgram = this._createProgram(gl, heatMapVS, heatMapFS);
    gl.useProgram(program);

    program.uMatrixProj = gl.getUniformLocation(program, "uMatrixProj");
    program.uLayerRects = gl.getUniformLocation(program, "uLayerRects");
    program.uLayerTransform = gl.getUniformLocation(program, "uLayerTransform");
    program.uRenderTargetOffset = gl.getUniformLocation(program, "uRenderTargetOffset");
    program.uColor = gl.getUniformLocation(program, "u_color");
    program.aCoord = gl.getAttribLocation(program, "aCoord");
    gl.enableVertexAttribArray(program.aCoord);

    // The boundary program.
    program = this.boundaryProgram = this._createProgram(gl, boundaryVS, boundaryFS);
    gl.useProgram(program);

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
  },

  _createProgram: function PS_createProgram(gl, vsSource, fsSource) {
    var vs = this._compileShader(gl, vsSource, gl.VERTEX_SHADER);
    var fs = this._compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      alert("Could not initialise shaders");
    }

    return program;
  },

  _compileShader: function PS_compileShader(gl, code, type) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      alert(gl.getShaderInfoLog(shader));
      return null;
    }

    return shader;
  },
};

LayerScope.DrawObject = function (uMatrixMV, uRenderTargetOffset, uLayerRects, rects, layerRef) {
  this.uMatrixMV = uMatrixMV;
  this.uRenderTargetOffset = uRenderTargetOffset;
  this.uLayerRects = uLayerRects;
  this.rects = rects;
  this.layerRef = layerRef;
};

LayerScope.DrawObject.initGL = function (gl) {
  LayerScope.DrawObject.gl = gl;

  //  Copy the logic from CompositorOGL::Initialize
  //    https://dxr.mozilla.org/mozilla-central/source/gfx/layers/opengl/CompositorOGL.cpp
  LayerScope.DrawObject.quadVBO = gl.createBuffer();
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
}

LayerScope.DrawObject.prototype = {
  constructor: LayerScope.DrawObject,

  drawLayer: function DO_drawLayer(selected) {
    var gl = LayerScope.DrawObject.gl;
    var program = LayerScope.ShaderPrograms.layerProgram;

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, LayerScope.DrawObject.quadVBO);
    gl.vertexAttribPointer(program.aCoord, 4, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(program.uLayerTransform, false, this.uMatrixMV);
    gl.uniform4fv(program.uRenderTargetOffset, this.uRenderTargetOffset);
    gl.uniform4fv(program.uLayerRects, this.uLayerRects);
    if (!!selected && this.layerRef == selected) {
      gl.uniform4f(program.uColor, 34 / 256, 133 / 256 , 186 / 256, 1.0);
    } else {
      gl.uniform4f(program.uColor, 1.0, 1.0, 1.0, 0.2);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6 * this.rects);
  },

  drawLayerBoundary: function DO_drawLayerBoundary() {
    var gl = LayerScope.DrawObject.gl;
    var program = LayerScope.ShaderPrograms.boundaryProgram
    ;
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.useProgram(program);
    gl.lineWidth(1.0);

    var uMatrixMV = this.uMatrixMV;
    var uRenderTargetOffset = this.uRenderTargetOffset;
    var uLayerRects = this.uLayerRects;
    var rects = this.rects;

    gl.bindBuffer(gl.ARRAY_BUFFER, program.vb)
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array(
        [uLayerRects[0], uLayerRects[1], 0,
         uLayerRects[0]+ uLayerRects[2], uLayerRects[1], 0,
         uLayerRects[0]+ uLayerRects[2], uLayerRects[1] + uLayerRects[3], 0,
         uLayerRects[0], uLayerRects[1] + uLayerRects[3], 0]),
      gl.STREAM_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, program.ib);
    gl.vertexAttribPointer(program.position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.position);

    gl.uniformMatrix4fv(program.uMatrixMV, false, uMatrixMV);
    gl.uniform4f(program.uColor, 201/ 256, 117/ 256, 130/ 256, 1.0);

    gl.drawElements(gl.LINE_LOOP, 4, gl.UNSIGNED_SHORT, 0);

    this.log();
  },

  log: function DO_log(){
    if (!LayerScope.DrawLog)
      return;

    var uMatrixMV = this.uMatrixMV;
    LayerScope.utils.log("uMatrixMV 1= " + uMatrixMV[0] + "," + uMatrixMV[1] + "," + uMatrixMV[2] +
                "," + uMatrixMV[3] + "," + uMatrixMV[4] + "," + uMatrixMV[5] +
                "," + uMatrixMV[6] + "," + uMatrixMV[7] + "," + uMatrixMV[8] +
                "," + uMatrixMV[9] + "," + uMatrixMV[10] + ","+ uMatrixMV[11]+
                "," + uMatrixMV[12] + "," + uMatrixMV[13] + "," + uMatrixMV[14] +
                ","+ uMatrixMV[15]);

    var uLayerRects = this.uLayerRects;
    LayerScope.utils.log("x = " + uLayerRects[0] + ". y = "+ uLayerRects[1] +
                ". w = " + uLayerRects[2] +". h = " + uLayerRects[3]);
  }
};

LayerScope.ThreeDViewImp = {
  gl: null,
  drawObjects: [],
  cameraOffset: [0, 0],
  _frame: null,

  layerSelection: function THD_layerSelection(className) {
    // TBD
    // Splash on the selected layers??
    this._drawScene(className);

    self = this;
    setTimeout(function () {
      self._drawScene();
    }, 1000);
  },

  input: function THD_input(frame) {
    // Convert each draw call into a draw obejct.
    if (frame != this._frame) {
        this.drawObjects = this._frameToDrawObjects(frame);
        this._frame = frame;
      }

      this._drawScene();
  },

  _drawScene: function THD_drawObjects(className) {
    var gl = this.gl;

    // Set up
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this._setProjectionMatrix(gl,
                           [LayerScope.ShaderPrograms.layerProgram,
                           LayerScope.ShaderPrograms.boundaryProgram]);

    // Draw layers first, then overlap boundary upon them.
    this.drawObjects.forEach(function (element, index) {
      element.drawLayer(className);
    });

    if (LayerScope.Config.drawQuadGrid) {
      this.drawObjects.forEach(function (element, index) {
        element.drawLayerBoundary();
      });
    }
  },

  _setProjectionMatrix: function THD_setProjectMatrix(gl, programs) {
    // Setup project matrix, uMatrixProj.
    // Gopy the logic from CompositorOGL::PrepareViewport:
    //   https://dxr.mozilla.org/mozilla-central/source/gfx/layers/opengl/CompositorOGL.cpp
    // TBD:
    //   1. Do we need to evaluate this martix every time?
    //   2. Do we need to accumulate CompositorOGL::mRenderOffset?
    // Need to accumulate render offset.
    var uMatrixProj = mat4.create();
    mat4.identity(uMatrixProj);
    mat4.translate(uMatrixProj, uMatrixProj, [-1.0, 1.0, 0]);
    //mat4.scale(uMatrixProj, [2.0 / gl.viewportWidth, 2.0 / gl.viewportHeight, 1.0]);
    var ratio = LayerScope.Config.ratio / 100.0;
    mat4.scale(uMatrixProj, uMatrixProj,
               [2.0 * ratio / gl.viewportWidth,
                2.0 * ratio / gl.viewportHeight,
                1.0]);
    mat4.scale(uMatrixProj, uMatrixProj, [1.0, -1.0, 0]); // flip
    mat4.translate(uMatrixProj, uMatrixProj,
                   [this.cameraOffset[0] / ratio,
                    this.cameraOffset[1] / ratio, 0, 0]);
    uMatrixProj[10] = 0.0; // project to (z=0) plane.
    programs.forEach(function(program) {
      gl.useProgram(program);
      gl.uniformMatrix4fv(program.uMatrixProj, false, uMatrixProj);
    });
  },

  _frameToDrawObjects: function THD_frameToDrawObjects(frame) {
    if (frame == undefined && LayerScope.DrawTesting) {
      fakeData();
    };

    var drawObjects = [];
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
      // With
      // 1. DrawObject::rects(draw.totlaRects), we know where to draw this tile
      // in 2D space.
      // 2. Texutre ID of this sprite(need sent it out from gecko)
      // We are able to reconstruct layer buffer!!
      LayerScope.utils.log("x = "+ uLayerRects[0],
                           ", y = " + uLayerRects[1],
                           ", w = "+ uLayerRects[2],
                           ", h = "+ uLayerRects[3],
                           ". texID = " + draw.texIDs[0]);
      drawObjects.push(new LayerScope.DrawObject(uLayerTransform,
                                                 uRenderTargetOffset,
                                                 uLayerRects,
                                                 draw.totalRects,
                                                 draw.layerRef.low.toString()));
    }
    // Splitter
    LayerScope.utils.log("-----------------------");

    return drawObjects;
  },

  deactive: function THD_deactive($panel) {
    this._frame = null;
    $panel.empty();
  },

  active: function THD_active($panel) {
    this._frame = null;
    $('#texture-container').css('overflow', 'hidden');

    var $canvas = $("<canvas>")
      .css('width', '100%')
      .css('height', '100%')
      .appendTo($panel)
      ;

    try {
      function logGLCall(functionName, args) {
        LayerScope.utils.log("gl." + functionName + "(" +
        WebGLDebugUtils.glFunctionArgsToString(functionName, args) + ")");
      }
      var gl = $canvas[0].getContext("experimental-webgl") || $canvas[0].getContext("webgl");
      this.gl = gl;
      //gl = this.gl = WebGLDebugUtils.makeDebugContext(gl, undefined, logGLCall);
    } catch(e) {
      alert('WebGL initialization failed...');
    }

    function canvasResize() {
      $canvas.attr('width', $canvas.width());
      $canvas.attr('height', $canvas.height());
      gl.viewportWidth = $canvas.attr('width');
      gl.viewportHeight = $canvas.attr('height');
    }

    canvasResize();

    var self = this;
    window.addEventListener("resize", function () {
      canvasResize();
      self._drawScene();
    });

    LayerScope.ShaderPrograms.create(gl);
    LayerScope.DrawObject.initGL(gl);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.BLEND);

    this._cameraMoveHanler($canvas);
  },

  _cameraMoveHanler: function THD_cameraMoveHanler($canvas) {
    this.cameraOffset = [0, 0,];

    var self = this;
    // Mouse evetn handling
    $canvas.on("mousedown", function (e) {
      var startX = e.pageX - self.cameraOffset[0], startY = e.pageY - self.cameraOffset[1];

      $canvas.on("mousemove", function (e) {
        self.cameraOffset = [(e.pageX - startX), (e.pageY - startY)];
        self._drawScene();
      });
      e.target.setCapture();
      $('body').css('cursor', 'grab');
    });

    $canvas.on("mouseup", function(e) {
      e.target.releaseCapture();
      $canvas.unbind("mousemove");
      $('body').css('cursor', 'default');
    });
  }
};

