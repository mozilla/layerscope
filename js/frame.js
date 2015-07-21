/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

// Layer Type Map
LayerScope.LayerNameMap = [
  "UnknownLayer",
  "LayerManager",
  "ContainerLayer",
  "PaintedLayer",
  "CanvasLayer",
  "ImageLayer",
  "ColorLayer",
  "RefLayer",
  "ReadbackLayer"
];

/*
 * Frame constructor.
 */
LayerScope.Frame = function (stamp) {
  this.id = stamp || {low: 0, high: 0};
  this.colors = [];
  this.layerTree= [];
  this.textureNodes = [];
  this.draws = [];
  this.displayList = null;
};
/*
LayerScope.Frame.prototype.toJSON = function (name) {
  return JSON.stringify({
    id: this.id,
    colors: this.colors,
    layerTree: this.layerTree,
    texs: this.textureNodes
  });
};*/

/*
 * A utility to iterate frame object .
 */
LayerScope.FrameUtils = {
  /**
   * Find a chrome layer object by ID of it.
   */
  findLayerByID: function FU_findLayerByID(frame, layerID) {
    console.assert(frame !== undefined && frame !== null);
    if (frame.layerTree === null || frame.layerTree === undefined) {
      return;
    }

    for (var root of frame.layerTree) {
      var layer = function findByID(node) {
        if (node.value.ptr.low == layerID) {
          return node;
        }

        for (var child of node.children) {
          var layer = findByID(child);
          if (layer !== undefined) {
            return layer;
          }
        }
      }(root);
    }

    return layer;
  },
  /**
   * Find a chrome layer object by ID of a content layer object.
   * @layer {int} the lower 32bits of layer pointer value.
   */
  findLayerByContentLayerID: function
    FU_findLayerByContentLayerID(source, layerID) {
    var tree = source.layerTree ? source.layerTree : source;

    for (var root of tree) {
      var layer = function findByID(node) {
        if (!!node.value.contentLayer) {
          // TBD:
          // convert contentLayer to a single string in data parser.
          //var layerPtr = LayerScope.utils.hex16(node.value.contentLayer.high,
          //                                      node.value.contentLayer.low);
          //if (layerPtr == layerID) {
          if (node.value.contentLayer == layerID) {
             //console.log("ContentLayer = ",
             //            LayerScope.utils.hex8(node.value.contentLayer.low),
             //            LayerScope.utils.hex8(node.value.ptr.low));
             return node;
          }
        }

        for (var child of node.children) {
          var layer = findByID(child);
          if (layer !== undefined) {
            return layer;
          }
        }
      }(root);
    }

    return layer;
  },

  /**
   * Find draw calls on a layer
   * @layer {int} the lower 32bits of layer pointer value.
   */
  findDrawsOnLayer: function FU_findDrawsOnLayer(frame, layerID) {
    var draws = [];

    for (var draw of frame.draws) {
      if (draw.layerRef.low == layerID)
        draws.push(draw);
    }

    return draws;
  },
};

