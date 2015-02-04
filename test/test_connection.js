/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

QUnit.test("test_connection", function(assert) {
  var cm = new LayerScope.ConnectionManager();
  cm.disconnect();
  assert.equal(cm._socket, null, "We expect cm._socket is null.")

  var info = cm._parseURL("ws://localhost:1234");
  assert.equal(info.port, 1234, "We expect port value to be 1234");
  assert.equal(info.protocol, "ws", "We expect protocol value to be ws");

  info = cm._parseURL("http://127.0.0.1:4321");
  assert.equal(info.port, 4321, "We expect port value to be 4321");
  assert.equal(info.protocol, "http", "We expect protocol value to be http");

  // Invalid port number.
  info = cm._parseURL("ws://localhost:1A2B");
  assert.ok(info === null, "We expect _parseURL returns null");
  // Miss port number.
  info = cm._parseURL("ws://localhost");
  assert.ok(info === null, "We expect _parseURL returns null");
  // Missing schema
  info = cm._parseURL("//localhost:1234");
  assert.ok(info === null, "We expect _parseURL returns null");
});
