/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

LayerScope.NO_FRAMES = "No frames"

LayerScope.ZoomController = {
  _ratioRange: [30, 50, 80, 100, 150, 200, 300],
  _ratio: 3,

  get ratio() {
    return this._ratioRange[this._ratio];
  },

  attach: function FC_attach($zoomIn, $zoom_1, $zoomOut) {
    $zoomIn.button()
      .on("click", function(event) {
        $zoomOut.button("option", "disabled", false);

        var ratio = LayerScope.ZoomController._ratio;
        if (++ratio  == LayerScope.ZoomController._ratioRange.length - 1) {
          $zoomIn.button("option", "disabled", true);
        }

        LayerScope.ZoomController._ratio++;
        LayerScope.Config.ratio = LayerScope.ZoomController._ratioRange[ratio];
        LayerScope.Session.display();
      });
    $zoomIn.css("background-image", "url(css/zoom-in.png)");

    $zoom_1.button()
      .on("click", function(event) {
        $zoomIn.button("option", "disabled", false);
        $zoomOut.button("option", "disabled", false);

        if (LayerScope.ZoomController._ratio == 3) {
          return;
        }

        LayerScope.ZoomController._ratio = 3;
        LayerScope.Config.ratio = LayerScope.ZoomController._ratioRange[3];
        LayerScope.Session.display();
      });
    $zoom_1.css("background-image", "url(css/zoom-1.png)");

    $zoomOut.button()
      .on("click", function(event) {
        $zoomIn.button("option", "disabled", false);

        var ratio = LayerScope.ZoomController._ratio;
        if (--ratio == 0) {
          $zoomOut.button("option", "disabled", true);
        }

        LayerScope.ZoomController._ratio--;
        LayerScope.Config.ratio = LayerScope.ZoomController._ratioRange[ratio];
        LayerScope.Session.display();
      });
    $zoomOut.css("background-image", "url(css/zoom-out.png)");

    // Enable tool buttons by default.
    $zoomIn.button("option", "disabled", false);
    $zoom_1.button("option", "disabled", false);
    $zoomOut.button("option", "disabled", false);
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
        LayerScope.Session.display(ui.value);
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

    LayerScope.Session.display(value);
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
