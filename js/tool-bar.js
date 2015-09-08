/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

LayerScope.NO_FRAMES = "No frames"

LayerScope.ViewerControls = {
  attach: function VC_attach($textureView, $quadView, $layerView) {
    this._attachControl($textureView, "url(css/2DView.png)",
                        "Texture View", "2D");
    this._attachControl($quadView, "url(css/3DView.png)",
                        "DrawQuad View", "3D");
    this._attachControl($layerView, "url(css/DLView.png)",
                        "Layer View", "DL");
  },

  _attachControl: function VC_attachControl($view, imageFile, title, msgType) {
    // View switch button
    $view.css("background-image", imageFile);
    $view.attr("title", title);
    $view.button()
      .on("click", function(event) {
        LayerScope.MessageCenter.fire("buffer.view", msgType);
        LayerScope.Session.redraw();
      });
  }
};

LayerScope.ZoomControls = {
  _ratioRange: [12.5, 25, 50, 100, 150, 200, 300],
  _ratioIndex: 3,

  attach: function ZC_attach($zoomIn, $zoomOne, $zoomOut) {
    var self = this;

    var fireZoomEvent = function (ratio) {
      self._ratioIndex = ratio;
      LayerScope.Config.zoomRatio = self._ratioRange[ratio] / 100.0;
      LayerScope.MessageCenter.fire("zoom", LayerScope.Config.zoomRatio);
    }

    // Zoom-in button
    $zoomIn.button()
      .on("click", function(event) {
        var ratio = self._ratioIndex + 1;
        if (ratio  == self._ratioRange.length - 1) {
          return;
        }

        fireZoomEvent(ratio);
      });
    this._attachControl($zoomIn, "url(css/zoom-in.png)", "Zoom In");

    // 1:1 button
    $zoomOne.button()
      .on("click", function(event) {
        var ratio = 3;
        if (self._ratioIndex == ratio) {
          return;
        }

        fireZoomEvent(ratio);
      });
    this._attachControl($zoomOne, "url(css/zoom-1.png)", "1:1");

    // Zoom-out button.
    $zoomOut.button()
      .on("click", function(event) {
        var ratio = self._ratioIndex - 1;
        if (ratio == 0) {
          return;
        }

        fireZoomEvent(ratio);
      });
    this._attachControl($zoomOut, "url(css/zoom-out.png)", "Zoom Out");
  },

  _attachControl: function ZC_attachControl($zoom, imageFile, title) {
    $zoom.css("background-image", imageFile);
    $zoom.attr("title", title);
    $zoom.button("option", "disabled", false);
  }
};

LayerScope.FrameController = {
  _$slider: 0,
  _$info: 0,
  _userSelection: false,

  attach: function FC_attach($slider, $info) {
    this._$slider = $slider;
    this._$info = $info;

    $slider.slider({
      value: 0,
      min: 0,
      max: 0,
      step: 1,
      animation: true,
      slide: function(evt, ui) {
        // Don't kick off render while sliding, it makes whole page sluggish.
        var max = this._$slider.slider("option", "max");
        this._updateInfo(ui.value, max);
        this._userSelection = true;
      }.bind(this),
      stop: function (event, ui) {
        LayerScope.Session.setCurrentFrame(ui.value);
      }
    });

    this._$info.html("<span>" + LayerScope.NO_FRAMES + "</span>");
  },

  get userSelected() {
    return this._userSelection;
  },

  advance: function FC_advance(right) {
    var max = this._$slider.slider("option", "max");
    var value =this._$slider.slider("option", "value");
    if (right) {
      if (max == value) {
        return;
      }

      this._$slider.slider("option", "value", ++value);
    } else {
      if (0 == value) {
        return;
      }

      this._$slider.slider("option", "value", --value);
    }

    LayerScope.Session.setCurrentFrame(value);
    this._updateInfo(value, max);
  },

  /*
   * @param {int} selectedFrame the index of the selected frame, 0-index base.
   */
  update: function FC_update(selectedFrame, totalFrames) {
    var max = 0;
    if (totalFrames == 0) {
      this._userSelection = false;
      max = 0;
    }
    else if (totalFrames == undefined) {
      max = this._$slider.slider("option", "max");
    } else {
      max = totalFrames - 1;
    }

    var min = this._$slider.slider("option", "min");

    // Validate arguments.
    console.assert(selectedFrame <= max && selectedFrame >= min ,
                   "FrameContoller.update: Invalid frame index");
    if (selectedFrame > max || selectedFrame < min) {
      return;
    }

    // Update this._$slider
    if (totalFrames !== undefined) {
      this._$slider.slider("option", "max", max);
    }
    if (selectedFrame !== undefined) {
      this._$slider.slider("option", "value", selectedFrame);
    }

    //  Update this._$info
    this._updateInfo(selectedFrame, max);
  },
  _updateInfo: function FC_updateInfo(selectedFrame, totalFrames) {
    if (totalFrames === 0) {
      this._$info.html("<span>" + LayerScope.NO_FRAMES + "</span>");
    } else {
      this._$info.html("<span>Frame " + selectedFrame + "/" +
                        totalFrames + "</span>");
    }
  }
};
