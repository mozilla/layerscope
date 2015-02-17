/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

QUnit.test("test_frame", function(assert) {

  var mockRoot = {};
  var mockFrame = {};
  mockFrame.layerTree = [mockRoot];
  mockRoot.value = {};
  mockRoot.value.ptr = {};
  mockRoot.value.ptr.low = 1234;

  var layer = LayerScope.FrameUtils.findLayerByID(mockFrame, 1234);
  assert.notEqual(layer, undefined, "We expect layer is not undefined");

  layer = LayerScope.FrameUtils.findLayerByID(mockFrame, 56789);
  assert.equal(layer, undefined, "We expect layer is undefined");

  var mockChild = {};
  mockRoot.children = [mockChild];
  mockChild.value = {};
  mockChild.value.ptr = {};
  mockChild.value.ptr.low = 4321;

  layer = LayerScope.FrameUtils.findLayerByID(mockFrame, 4321);
  assert.notEqual(layer, undefined, "We expect layer is not undefined");
});
