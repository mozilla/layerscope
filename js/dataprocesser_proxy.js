/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 *  * License, v. 2.0. If a copy of the MPL was not distributed with this
 *   * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

// Process sockect data from the profile target.
LayerScope.ProtoDataProcesserProxy = {
  _graph: null,
  begin: function PDP_begin(graph) {
    this.end();
    this._graph = graph;
    this._worker = new Worker('js/dataprocesser_worker.js');
    this._worker.onmessage = this.receiveMessage.bind(this);
  },

  end: function PDP_end() {
    this._graph = null;
    this._receivingFrame = null;
  },

  receiveMessage: function PDP_receiveMessage(e) {
    var aMessage = e.data;
    var images = aMessage.images;
    for (var key in images) {
      if (images.hasOwnProperty(key)) {
        this._graph.imageDataPool.add(key, images[key]);
      }
    }
    this._graph.appendFrame(aMessage.frame);
  },

  input: function PDP_input(data) {
    this._worker.postMessage(data, [data]);
  },
};

LayerScope.DataProcesserNode.register(LayerScope.ProtoDataProcesserProxy)
