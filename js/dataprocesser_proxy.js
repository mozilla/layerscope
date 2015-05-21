/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

// Process sockect data from the profile target.
LayerScope.ProtoDataProcesserProxy = {
  _graph: null,
  _worker: null,

  begin: function PDP_begin(graph) {
    this.end();
    this._graph = graph;
  },

  end: function PDP_end() {
    this._graph = null;
    if (typeof LayerWorker == "undefined") {
      this._worker.postMessage({command: 'end'});
    } else {
      LayerWorker.OnMessage({ data: { command: 'end' } });
    }
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
    if (typeof LayerWorker == "undefined") {
      this._worker.postMessage({pbuffer: data}, [data]);
    } else {
      LayerWorker.OnMessage({ data: { pbuffer: data } });
    }
  },
};

if (typeof LayerWorker == "undefined") {
  LayerScope.ProtoDataProcesserProxy._worker = new Worker('js/dataprocesser_worker.js');
  LayerScope.ProtoDataProcesserProxy._worker.onmessage =
    LayerScope.ProtoDataProcesserProxy.receiveMessage.bind(LayerScope.ProtoDataProcesserProxy);
}

LayerScope.DataProcesserNode.register(LayerScope.ProtoDataProcesserProxy)
