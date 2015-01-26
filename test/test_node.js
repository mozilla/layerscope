
/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

QUnit.test("test_node", function(assert) {
  var mock_graph = {};

  var mock_node_instance = {
    begin: function (graph) {
      assert.ok(true, "begin was called");
      assert.equal(graph, mock_graph);
    },
    end: function () {
      assert.ok(true, "end was called")
    },
    input: function (data) {
      assert.ok(true, "input was called")
    }
  };

  assert.expect(4);

  var node = new LayerScope.Node(mock_graph);
  // Call Node functions before registry.
  node.begin();
  node.end();
  node.input();

  // Call Node functions after registry.
  node.register(mock_node_instance);
  node.begin();
  node.end();
  node.input();
});
