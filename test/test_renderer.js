/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

QUnit.test("test_renderer", function(assert) {
  var Mock1Listener = {
    notify: function (msg, value) {
      if (msg === "msg1") {
        assert.equal(value, 1, "We expect value to be 1");
      } else {
        assert.ok(false, "Unexpect value");
      }
    }
  };

  var Mock2Listener = {
    notify: function (msg, value) {
      if (msg === "msg2") {
        assert.equal(value, 2, "We expect value to be 2");
      } else {
        assert.ok(false, "Unexpect value");
      }
    }
  };


  assert.expect(2);
  LayerScope.RendererLocalMessageCenter.subscribe("msg1", Mock1Listener);
  LayerScope.RendererLocalMessageCenter.subscribe("msg2", Mock2Listener);

  LayerScope.RendererLocalMessageCenter.fire("msg1", 1);
  LayerScope.RendererLocalMessageCenter.fire("msg2", 2);
});
