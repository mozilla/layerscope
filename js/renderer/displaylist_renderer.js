/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

/**
 * Draw layer textures and the boundary of a selected display item.
 * And hold everything that is needed to do so.
 */
LayerScope.DisplayListDrawer = {
  _drawRects: [],
  _$canvas: null,
  _ctx: null,
  _sprites: [],                // Hold layer's image buffers.
  _layerOffset: { x: 0, y:0 }, // Layer's transition.

  /**
   * Create and initiate a canvas according to the content of a layer.
   * $panel - where to hook up canvas.
   * frame - the current frame data.
   * layer - the selected layer.
   */
  init: function DLD_init($panel, frame, layer) {
    this.active();

    this._layerOffset.x = -layer.value.region[0].x;
    this._layerOffset.y = -layer.value.region[0].y;

    // Create canvas container.
    var $container = $('<div id="display-list-container">');
    $container.attr("align", "center");
    $panel.append($container);

    // Create canvas.
    var ratio = LayerScope.Config.ratio / 100;
    // TBD:
    // Rect union function need.
    var width = 0, height = 0;
    for (var region of layer.value.region) {
      if ((region.w + region.x) > width) {
        width = (region.w + region.x);
      }
      if ((region.h + region.y) > height) {
        height = (region.h + region.y);
      }
    }

    width *= ratio;
    height *= ratio;

    this._$canvas = $('<canvas id="display-list-canvas">')
      .attr("class", "background-" + LayerScope.Config.background)
      .attr('width', width + 'px')
      .attr('height', height + 'px')
      ;

    $container.append(this._$canvas);
    this._ctx = this._$canvas[0].getContext("2d");

    // Create layer content sprites.
    this._collectSprites(frame, layer);
  },

  deactive: function DLD_deactive() {
    this._drawRects = [];
    this._$canvas = null;
    this._ctx = null;
    this._sprites = [];
  },

  active: function DLD_active() {
    this.deactive();
  },

  clearRect: function DLD_clearRect() {
    this._drawRects = [];
  },

  addRect: function DLD_addRect(rect) {
    console.assert(rect.length == 4);
    this._drawRects.push(rect);
  },

  drawRect: function DLD_drawRect(rect) {
    this.clearRect();
    this.addRect(rect);
    this.draw(false);
  },

  fillRect: function DLD_drawRect(rect) {
    this.clearRect();
    this.addRect(rect);
    this.draw(true);
  },

  draw: function DLD_draw(fillRect) {
    // Clear color.
    this._ctx.clearRect(0, 0, this._$canvas[0].width, this._$canvas[0].height);

    // Draw Begin.
    var ratio = LayerScope.Config.ratio / 100;
    this._ctx.save();
    //this._ctx.translate(this._layerOffset.x * ratio, this._layerOffset.y * ratio);
    this._ctx.scale(ratio, ratio);

    // Draw layer images.
    for (var image of this._sprites) {
      this._ctx.drawImage(image.canvas, image.layerRect.x, image.layerRect.y);
    }

    // Draw selected display item.
    this._ctx.beginPath();
    this._ctx.strokeStyle = '#ff0000';
    this._ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
    this._ctx.lineWidth = 5;
    for (var rect of this._drawRects) {
      if (fillRect) {
        this._ctx.fillRect(rect[0], rect[1], rect[2], rect[3]);
      }

      this._ctx.rect(rect[0], rect[1], rect[2], rect[3]);
    }
    this._ctx.stroke();
    this._ctx.closePath();

    // Draw End
    this._ctx.restore();
  },

  /*
   * Collect image buffers of a layer.
   */
  _collectSprites: function DLD_collectSprites(frame, layer) {
    var drawInfos = [];

    // Collect texture nodes of this layer.
    for (let texNode of frame.textureNodes) {
      if (layer.value.ptr.low == texNode.layerRef.low) {
        // texture.name literally means texture ID.
        var drawInfo= {
          id: texNode.name,
          image: LayerScope.LayerBufferRenderer._graph.findImage(texNode.texID),
          position: [],
          layerRects: [],
          textureRects: []};
        drawInfos.push(drawInfo);
      }
    }

    // Identify the position of each texture node
    drawInfos.forEach(function (drawInfo) {
      let found = false;
      for (let draw of frame.draws) {
        // A draw object without texIDs means it uses the same texture with
        // previous draw object.
        if (found) {
          if (!!draw.texIDs[0]) {
            break;
          }

          drawInfo.layerRects.push(draw.layerRect[0]);
          drawInfo.textureRects.push(draw.textureRect[0]);
        }

        if (draw.texIDs[0] == drawInfo.id) {
          drawInfo.layerRects.push(draw.layerRect[0]);
          drawInfo.textureRects.push(draw.textureRect[0]);
          found = true;
        }
      }
    });

    // Add texture and draw position into Drawer.
    for (let info of drawInfos) {
      for (let i = 0; i < info.layerRects.length; i++) {
        this._createSprite(info.image,
                           info.layerRects[i],
                           info.textureRects[i]);
      }
    }
  },

  _createSprite: function DLD_createSprite(imageData, layerRect, textureRect) {
    var image = {layerRect: layerRect,
                 canvas: null};

    // Create a canvas to hold imageData.
    // The reason why we need to create a canvas for an image data is because
    // layerscope support scaling.
    image.canvas = $("<canvas>")
      .attr("width", imageData.width * textureRect.w)
      .attr("height", imageData.height * textureRect.h)[0];

    image.canvas.getContext("2d")
      .putImageData(imageData,
                    -(imageData.width * textureRect.x),
                    -(imageData.height * textureRect.y));

    this._sprites.push(image);
  },
};

/*
 * Represents a display list of a layer in a form of tree view.
 */
LayerScope.DisplayListViewImp = {
  _$panel: null,
  _frame: null,
  _layer: null,

  layerSelection: function DLV_layerSelection(layerID) {
    this._$panel.empty();

    // Skip UI creation if no displayList associated with the selected frame.
    var layer = LayerScope.FrameUtils.findLayerByID(this._frame, layerID);
    if (!layer || !layer.value.displayList) {
      return;
    }

    // Generate a display list tree div for the seleted layer
    var displayList = layer.value.displayList;
    let $leftPanel = $('<div id="layerview-left-panel">');
    let $tree = $('<div id="layerview-display-list">');
    let $rootUL = $("<ul>");

    this._createTreeNode($rootUL, displayList);
    $tree.append($rootUL);
    $leftPanel.append($tree);

    // Create property table.
    var $table = $('<table id="display-property-table" class="display" cellspacing="0">');
    $leftPanel.append($table);
    this._$panel.append($leftPanel);

    $table.dataTable({
      "bSort": false,  // Don't sort it.
      "scrollY":        "300px",
      "scrollCollapse": true,
      "paging":         false,
      //"pageLength":     10,
      "columns": [ {"width": "40%"}, {"width": "60%"} ],
    });

    let self = this;
    $tree.bind("loaded.jstree", function(event, data) {
      data.instance.open_all();
    }).bind("select_node.jstree", function(event) {
      // Find the selected display item.
      var ids = $("#layerview-display-list").jstree('get_selected');
      console.assert(ids.length == 1);
      let $li = $("#" + ids[0]);
      let index = $li.attr("display-item-index");
      let displayItem = LayerScope.DisplayItem.findByIndex(displayList, index);

      // Draw the properties of the selected dispaly item.
      self._drawProperty(displayItem);
    }).bind("hover_node.jstree", function(event) {
      var $hovered = $("#layerview-display-list .jstree-hovered");
      console.assert($hovered.length == 1);
      let index = $hovered.parent().attr("display-item-index");
      let displayItem = LayerScope.DisplayItem.findByIndex(displayList, index);
      if (!displayItem) {
        return;
      }

      var appUnitPerDevUit = 60 / self._frame.scale;
      if (!!displayItem.layer) {
        var layer = LayerScope.FrameUtils
          .findLayerByContentLayerID(self._frame, displayItem.layer);

        LayerScope.utils.log(!!layer ? "Layer Found" : "Layer Missed");
        LayerScope.utils.log("Draw on layer(" + displayItem.layer + ")");

        var region = LayerScope.DisplayItem.getBoundary(displayItem,
                                                        layer,
                                                        appUnitPerDevUit);
        if (region) {
          LayerScope.utils.log("Display Item Region", region[0], region[1],
                               region[2], region[3]);

          if (displayItem.name === "LayerEventRegions" ||
              displayItem.name === "nsDisplayTransform") {
            LayerScope.DisplayListDrawer.drawRect(region);
          } else {
            LayerScope.DisplayListDrawer.fillRect(region);
          }
        }
      }

      // Splitter
      LayerScope.utils.log("--------------");
    }).jstree();

    // Create canvas.
    LayerScope.DisplayListDrawer.init(this._$panel, this._frame, layer);
    LayerScope.DisplayListDrawer.draw();
  },

  active: function DLV_active($panel) {
    $panel.empty();

    this._frame = null;
    this._$panel = $panel;
    this._layer = null;

    LayerScope.DisplayListDrawer.active();
  },

  deactive: function DLV_deactive($panel) {
    $panel.empty();

    this._frame = null;
    this._$panel = null;
    this._layer = null;

    LayerScope.DisplayListDrawer.deactive();
  },

  input: function DLV_input(frame) {
    if (frame != this._frame) {
      this._$panel.empty();
    }

    this._frame = frame;
    LayerScope.DisplayListDrawer.clearRect();
  },

  _createTreeNode: function DLV_createTreNode($ul, displayItem) {
    let $li = $("<li>")
      .appendTo($ul)
      .text(displayItem.name)
      .attr("data-jstree", displayItem.children.length ?
                 '{"icon":"css/layers-icon.png"}' :
                 '{"icon":"css/texture-icon.png"}')
      .attr("display-item-index", displayItem.index)
        ;

    if (displayItem.children.length > 0) {
      let $childUL = $("<ul>").appendTo($li);
      for (let i = 0; i < displayItem.children.length; i++) {
        this._createTreeNode($childUL, displayItem.children[i]);
      }
    }
  },

  _drawProperty: function _drawProperty(displayItem) {
    var $table = $("#display-property-table").DataTable();
    $table.clear();

    var a2d = 60 / this._frame.scale;

    $table.row.add(["Name", displayItem.name]);
    $table.row.add(["Address", displayItem.address]);
    $table.row.add(["Layer",
      !!displayItem.layer ? displayItem.layer : "No Layer"]);
    if (!!displayItem.layerBounds) {
      $table.row.add(["Layer Bound",
         "x = " + (displayItem.layerBounds[0] / a2d).toFixed() + "<br>" +
         "y = " + (displayItem.layerBounds[1] / a2d).toFixed() + "<br>" +
         "w = " + (displayItem.layerBounds[2] / a2d).toFixed() + "<br>" +
         "h = " + (displayItem.layerBounds[3] / a2d).toFixed()
         ]);
    }
    $table.row.add(["Children", displayItem.children.length]);
    $table.row.add(["Full Log", displayItem.line]);

    $table.draw();

  }
};

