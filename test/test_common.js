/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

QUnit.test("test_texturepool", function(assert) {
  var pool = new LayerScope.ImageDataPool();
  var width = 1;
  var stride = 4;
  var height = 1;
  var format = 0;
  var source = new Uint8Array(stride * height);
  source[0] = source[1] = source[2] = source[3] = 125;

  // The same content, the same hash key
  var key1 = pool.createTexture(source, width, height, format, stride);
  var key2 = pool.createTexture(source, width, height, format, stride);
  assert.equal(key1, key2, "We expect key1 is equal to key2");

  source[0] = source[1] = source[2] = source[3] = 1;
  var key3 = pool.createTexture(source, width, height, format, stride);
  assert.notEqual(key3, key1, "We expect key1 is not equal to key3");

  var image = pool.findImage(key1);
  assert.notEqual(image, null, "We expect image is not null");
  assert.equal(image.width, 1, "We expect image.width is 1");
  assert.equal(image.height, 1, "We expect image.height is 1");

  var image2 = pool.findImage(0);
  assert.equal(image2, null, "We expect image2 is null");
});

QUnit.test("test_taskchain", function(assert) {
  LayerScope.TaskChain.empty();

  var done1 = assert.async();
  var done2 = assert.async();
  var done3 = assert.async();

  LayerScope.TaskChain.addTask(function (_arg) {
    assert.ok(_arg == 1, "We expect _arg to be 1")
    done1();
  }, 1);
  LayerScope.TaskChain.addTask(function (_arg) {
    assert.ok(_arg == 2, "We expect _arg to be 2")
    done2();
  }, 2);

  LayerScope.TaskChain.onComplete = function () {
    assert.ok(true, "We expect get onComplete callback after all tasks finished");
    done3();
  }

  LayerScope.TaskChain.start();
});

QUnit.test("test_messagecenter", function(assert) {
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
  LayerScope.MessageCenter.subscribe("msg1", Mock1Listener);
  LayerScope.MessageCenter.subscribe("msg2", Mock2Listener);

  LayerScope.MessageCenter.fire("msg1", 1);
  LayerScope.MessageCenter.fire("msg2", 2);
});
