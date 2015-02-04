/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

QUnit.test("test_frameController", function(assert) {
  var controller = LayerScope.FrameController;

  //  Setup.
  //  Create widgets for FrameController.
  var slider = $("<div id='frame-slider'></div>");
  var info = $("<div id='frame-info'></div>");
  slider.appendTo("body");
  info.appendTo("body");

  // Attach contrller with widgets.
  controller.attach(slider, info);

  // Before any update, info.text should be equal to LayerScope.NO_FRAMES.
  assert.equal(info.text(), LayerScope.NO_FRAMES,
               "We expect frame information to be '" +
               LayerScope.NO_FRAMES + "'");

  // Change slide range and current position.
  controller.update(50, 100);
  assert.equal(slider.slider("option", "value"), 50, "We expect frame position to be 50");
  assert.equal(slider.slider("option", "min"), 0, "We expect min slider value to be 0");
  assert.equal(slider.slider("option", "max"), 99, "We expect max slider value to be 99");
  assert.equal(info.text(), "Frame 50/99", "We expect frame information to be 'Frame 50/99'");

  // Change current position.
  controller.update(10);
  assert.equal(slider.slider("option", "value"), 10, "We expect frame position to be 10");
  assert.equal(slider.slider("option", "max"), 99, "We expect max slider value to be 99");
  assert.equal(info.text(), "Frame 10/99", "We expect frame information to be 'Frame 10/99'");

  // Give a non-sense value, frame position should keep still.
  controller.update(101);
  assert.equal(slider.slider("option", "value"), 10, "We expect frame position to be 10");

  // Back to origin state.
  controller.update(0, 0);
  assert.equal(info.text(), LayerScope.NO_FRAMES,
               "We expect frame information to be '" +
               LayerScope.NO_FRAMES + "'");

  // Teardown.
  // Destroy widgets.
  $("#frame-info").remove();
  $("#frame-slider").remove();
});
