/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

QUnit.test("test_connection", function(assert) {
  var cm = new LayerScope.ConnectionManager();
  cm.disconnect();
  assert.equal(cm._socket, null, "We expect cm._socket is null.")

  var urlInfo = cm._parseURL("ws://localhost:1234");

  assert.equal(urlInfo.port, 1234, "We expect port value to be 1234");
  assert.equal(urlInfo.protocol, "ws", "We expect protocol value to be ws");
});
