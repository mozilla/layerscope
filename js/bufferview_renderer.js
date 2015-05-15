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
var geckoVS = "\
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
  gl_FragColor = vec4(1.0, 1.0, 1.0, 0.5);\
}";

var fragmentShader = "\
precision mediump float;\
\
void main(void) {\
  gl_FragColor = vec4(1.0, 1.0, 1.0, 0.2);\
}";

var vertextShader = "\
attribute vec3 aCoord;\
\
uniform mat4 uLayerTransform;\
uniform mat4 uMatrixProj;\
\
void main(void) {\
  gl_Position = uMatrixProj * uLayerTransform * vec4(aCoord, 1.0);\
}";

LayerScope.ThreeDViewImp = {
  gl: null,
  program: null,
  positionBuffer: null,
  quadVBO: null,

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
    mat4.scale(uMatrixProj, [2.0 / gl.viewportWidth, 2.0 / gl.viewportHeight, 1.0]); // squish
    mat4.scale(uMatrixProj, [1.0, -1.0, 0]); // flip
    uMatrixProj[10] = 0.0; // project to (z=0) plane.
    gl.uniformMatrix4fv(this.program.uMatrixProj, false, uMatrixProj);
    // 100X100X100 cube
    /*var uMatrixProj = mat4.create();
    mat4.ortho(-100, 100, -100, 100, -100, 100, uMatrixProj);
    gl.uniformMatrix4fv(this.program.uMatrixProj, false, uMatrixProj);
    var uLayerTransform = mat4.create();
    mat4.identity(uLayerTransform);
    gl.uniformMatrix4fv(this.program.uLayerTransform, false, uLayerTransform);
*/
    /*var uMatrixProj = mat4.create();
    mat4.identity(uMatrixProj);
    mat4.translate(uMatrixProj, [-1.0, 1.0, 0]); // OpenGL unit cube.
    mat4.scale(uMatrixProj, [2.0 / 100, 2.0 / 100, 1.0]); // squish
    mat4.scale(uMatrixProj, [-1.0, -1.0, 1.0]); // flip
    //uMatrixProj[10] = 0.0; // project to (z=0) plane.
    gl.uniformMatrix4fv(this.program.uMatrixProj, false, uMatrixProj);
    var uLayerTransform = mat4.create();
    mat4.identity(uLayerTransform);
    gl.uniformMatrix4fv(this.program.uLayerTransform, false, uLayerTransform);

    var pbuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pbuffer);
    vertices = [
      50.0,  50.0,  0.0,
      -50.0,  50.0,  0.0,
      50.0, -50.0,  0.0,
      -50.0, -50.0,  0.0
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    pbuffer.itemSize = 3;
    pbuffer.numItems = 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, pbuffer);
    gl.vertexAttribPointer(this.program.aCoord, pbuffer.itemSize, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, pbuffer.numItems);*/

    // Prepare fake data.
    // Mimic data from gecko.
    // drawAction
    //   layerRef
    //   layerTramsfrom(Float32Array, length == 16)
    //   xOffset/ yOffset (Float)
    //   quads (Int)
    //   layerRects (Float32Array, length == 16, gecko does not always need to pass 16 items to
    //     the viewer side, the viewer need to add it up to 16 items.)
    if (frame == undefined) {
      frame = {};
      var node1 = {};
      node1.layerTransform = [
      1.0, 0.0, 0.0, 0.0,
      0.0, 1.0, 0.0, 0.0,
      0.0, 0.0, 1.0, 0.0,
      0.0, 0.0, 0.0, 1.0,
      ];
      node1.xOffset = 0.0;
      node1.yOffset = 0.0;
      node1.quads = 1;
      node1.layerRects = [
        // x, y, width, height
        0.0, 0.0, 500.0, 500.0,
        0.0, 0.0, 0.0, 0.0,
        0.0, 0.0, 0.0, 0.0,
        0.0, 0.0, 0.0, 0.0
      ];

      var node2 = {};
      node2.layerTransform = [
      1.0, 0.0, 0.0, 0.0,
      0.0, 1.0, 0.0, 0.0,
      0.0, 0.0, 1.0, 0.0,
      0.0, 0.0, 0.0, 1.0,
      ];
      node2.xOffset = 0.0;
      node2.yOffset = 0.0;
      node2.quads = 1;
      node2.layerRects = [
        400.0, 400.0, 256.0, 256.0,
        0.0, 0.0, 0.0, 0.0,
      ];

      frame.textureNodes = [node1, node2];
    };

    // Draw quads.
    for (let texNode of frame.textureNodes) {
      var uLayerTransform = new Float32Array(texNode.layerTransform);
      console.assert(uLayerTransform.length == 16);

      var uRenderTargetOffset = new Float32Array([texNode.xOffset, texNode.yOffset, 0.0, 0.0]);
      // Sender may not always send an array with 16 itrms.
      var uLayerRects = new Float32Array(16);
      texNode.layerRects.forEach(function (element, index) {
        uLayerRects[index] = element;
      });

      console.assert(texNode.quads > 0 && texNode.quads <= 4);
      this._drawQuad(this.gl, uLayerTransform, uRenderTargetOffset, uLayerRects, texNode.quads);
    }
  },

  _drawQuad: function TDV_drawQuad(gl, uLayerTransform, uRenderTargetOffset, uLayerRects, quads) {
    // Attribute.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.vertexAttribPointer(this.program.aCoord, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.program.aCoord);

    // Uniforms.
    gl.uniformMatrix4fv(this.program.uLayerTransform, false, uLayerTransform);
    gl.uniform4fv(this.program.uRenderTargetOffset, uRenderTargetOffset);
    gl.uniform4fv(this.program.uLayerRects, uLayerRects);

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6 * quads);
  },

  deactive: function TDV_deactive($panel) {
    var gl = this.gl;

    $panel.empty();

    if (this.quadVBO) {
      gl.deleteBuffers(1, this.quadVBO);
      this.quadVBO = null;
    }
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
        console.log("gl." + functionName + "(" + 
        WebGLDebugUtils.glFunctionArgsToString(functionName, args) + ")");   
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

    this.program = this._initProgram(gl);

    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    // We don't need depth test in layer system.
    //gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.enable(gl.BLEND);
  },

  _initTestProgram: function THD_initProgram(gl) {
    // Create a linked program.
    var vs = this._compileShader(vertextShader, gl.VERTEX_SHADER);
    var fs = this._compileShader(fragmentShader, gl.FRAGMENT_SHADER);
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      alert("Could not initialise shaders");
    }

    gl.useProgram(program);

    // Populate the index of uniforms and attributes.
    (function populateUniformsAndAttribs(gl, program) {
      // Vertext shader
      program.aCoord = gl.getAttribLocation(program, "aCoord");
      gl.enableVertexAttribArray(program.aCoord);

      program.uMatrixProj = gl.getUniformLocation(program, "uMatrixProj");
      program.uLayerTransform = gl.getUniformLocation(program, "uLayerTransform");
    })(gl, program);

    return program;
  },
  _initProgram: function THD_initProgram(gl) {
    // Create a linked program.
    var vs = this._compileShader(geckoVS, gl.VERTEX_SHADER);
    var fs = this._compileShader(heatMapFS, gl.FRAGMENT_SHADER);
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      alert("Could not initialise shaders");
    }

    gl.useProgram(program);

    // Populate the index of uniforms and attributes.
    (function populateUniformsAndAttribs(gl, program) {
      program.uMatrixProj = gl.getUniformLocation(program, "uMatrixProj");
      program.uLayerRects = gl.getUniformLocation(program, "uLayerRects");
      program.uLayerTransform = gl.getUniformLocation(program, "uLayerTransform");
      program.uRenderTargetOffset = gl.getUniformLocation(program, "uRenderTargetOffset");
      program.aCoord = gl.getAttribLocation(program, "aCoord");
    })(gl, program);

    this._generateQuadVBO();
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
    this.begin();
    this.input();
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