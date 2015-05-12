/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

/*
 * Frame constructor.
 */
LayerScope.Frame = function (stamp) {
  this.id = stamp || {low: 0, high: 0};
  this.colors = [];
  this.layerTree= [];
  this.textureNodes = [];
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

        if (!node.children) {
          return;
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
  }
};
