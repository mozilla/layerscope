
/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

QUnit.test("test_texturepool", function(assert) {

  var pool = new LayerScope.TexturePool();
  var width = 1;
  var stride = 4;
  var height = 1;
  var format = 0;
  var source = new Uint8Array(stride * height);
  source[0] = source[1] = source[2] = source[3] = 125;

  // The same content, the same hash key
  var key1 = pool.create(source, width, height, format, stride);
  var key2 = pool.create(source, width, height, format, stride);
  assert.equal(key1, key2, "We expect key1 is equal to key2");

  source[0] = source[1] = source[2] = source[3] = 1;
  var key3 = pool.create(source, width, height, format, stride);
  assert.notEqual(key3, key1, "We expect key1 is not equal to key3");

  var texture = pool.find(key1);
  assert.notEqual(texture, null, "We expect texture is not null");

  var texture2 = pool.find(0);
  assert.equal(texture2, null, "We expect texture2 is null");
});
