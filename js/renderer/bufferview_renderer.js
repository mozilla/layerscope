/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

LayerScope.LayerBufferRendererMap = {
  "2D": LayerScope.TwoDViewImp,
  "3D": LayerScope.ThreeDViewImp,
  "DL": LayerScope.DisplayListViewImp
};

LayerScope.LayerBufferRenderer = {
  _view: null,
  _graph: null,

  init: function TR_init(graph) {
    this._graph = graph;

    // Set the default buffer view.
    this._view = LayerScope.TwoDViewImp;

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
      this._view = LayerScope.LayerBufferRendererMap[value];
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
