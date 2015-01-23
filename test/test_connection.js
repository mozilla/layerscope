
QUnit.test("test_connectionHandler", function(assert) {
  var cm = new LayerScope.ConnectionManager();
  cm.disconnect();
  assert.equal(cm._socket, null, "We expect cm._socket is null.")

  var urlInfo = cm._parseURL("ws://localhost:1234");

  assert.equal(urlInfo.port, 1234, "We expect port value to be 1234");
  assert.equal(urlInfo.protocol, "ws", "We expect protocol value to be ws");
});
