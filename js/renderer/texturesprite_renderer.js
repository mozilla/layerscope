/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 *  file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

LayerScope.SpriteView = {
  _$panel: null,
  _frame: null,
  _textures: [],
  _colors: [],

  layerSelection: function SV_layerSelection(layerID) {
    $(".selected-sprite").removeClass("selected-sprite");
    var $sprites = $("." + layerID).addClass("selected-sprite");
    if ($sprites.length == 0) {
      return;
    }

    // Scroll to those sprite.
    var top = $("#texture-container").scrollTop() + $sprites.position().top;
    $("#texture-container").animate({scrollTop:top}, '500', 'swing');
  },

  active: function SV_active($panel) {
    this._frame = null;
    this._textures = [];
    this._colors = [];
    $('#texture-container').css('overflow', 'auto');
    this._$panel = $panel;
  },

  deactive: function SV_deactive($panel) {
    this._frame = null;
    $panel.empty();
  },

  zoom: function SV_zoom(value) {
    this._resizeSprites(this._textures, this._colors);
  },

  input: function SV_input(frame) {
    // Regenerate texture and color sprite iff we get a new frame input.
    if (frame != this._frame) {
      this._$panel.empty();
      this._textures = [];
      this._colors = [];

      this._createTexSprites(frame, this._$panel);
      this._createColorSprites(frame, this._$panel);
      this._frame = frame;
    }

    // Fit texCanvas size according to the current zoom ratio.
    this._resizeSprites(this._textures, this._colors);
  },

  _createTexSprites: function SV_createTexSprites(frame, $panel) {
    for (let texNode of frame.textureNodes) {
      if (!texNode) {
        continue;
      }

      let imageData = LayerScope.LayerBufferRenderer._graph.findImage(texNode.texID);

      if (!imageData) {
        continue;
      }

      let $sprite = $("<div>")
        .addClass("buffer-sprite")
        .addClass(texNode.layerRef.low.toString());

      // name + target + size.
      let $title = $("<div>").addClass("sprite-title")
        .appendTo($sprite);
      $title.append($("<p>" + texNode.name + " &mdash; " +
        GLEnumNames[texNode.target] + " &mdash; "+ imageData.width +
        "x" + imageData.height + "</p>"));

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
      let $canvas = this._createCanvas(imageData);
      $sprite.append($canvas);
      this._textures.push($canvas);

      // Create decorations.
      // Red rectangle - denote new content
      if (texNode.newContent) {
        let $canvas = $("<canvas>")
          .addClass("decoration-canvas")
          .attr('width', 20)
          .attr('height', 20)
          .appendTo($sprite);
        let ctx = $canvas[0].getContext("2d");
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, 10, 20);
      }

      // Last step, append this new sprite.
      $panel.append($sprite);
    }
  },

  _resizeSprites: function SV_drawTexSprites(textureSprites, colorSprites) {
    var ratio = LayerScope.Config.zoomRatio;

    // Resize tex sprites.
    for (let $canvas of textureSprites) {
      $canvas
        .attr("class", "background-" + LayerScope.Config.background)
        .css('width', $canvas.attr("width") * ratio)
        .css('height', $canvas.attr("height") * ratio)
        ;
    }

    // Resize color sprites.
    for (let i = 0; i < colorSprites.length; i++) {
      let color = this._frame.colors[i];

      colorSprites[i]
        .width(color.width * ratio)
        .height(color.height * ratio)
        ;
    }
  },

  _createCanvas: function SV_createCanvas(imageData) {
    let $canvas = $("<canvas>")
      .attr("class", "background-" + LayerScope.Config.background)
      .attr('width', imageData.width)
      .attr('height', imageData.height)
      ;
    let ctx = $canvas[0].getContext("2d");

    ctx.putImageData(imageData, 0, 0);

    return $canvas;
  },

  _createColorSprites: function SV_createColorSprites(frame, $panel) {
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
        var $bgdiv = $("<div>").addClass("background-" + LayerScope.Config.background);
        let $cdiv = $("<div>")
          .width(o.width)
          .height(o.height)
          .css("background-color", LayerScope.utils.rgbaToCss(o.color))
          .appendTo($bgdiv);
        this._colors.push($cdiv);
      }

      $sprite.on("click", function() {
        LayerScope.MessageCenter.fire("buffer.select", layerID.toString());
      });

      $sprite.append($bgdiv);
      $panel.append($sprite);
    }
  }
};

