/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 *  * License, v. 2.0. If a copy of the MPL was not distributed with this
 *   * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

// GL Texture name
const GL_TEXTURE_2D = 0x0DE1;
const GL_TEXTURE_EXTERNAL = 0x8D65;
const GL_TEXTURE_RECTANGLE = 0x84F5;

GLEnumNames = {}
GLEnumNames[GL_TEXTURE_2D] = "TEXTURE_2D";
GLEnumNames[GL_TEXTURE_EXTERNAL] = "TEXTURE_EXTERNAL";
GLEnumNames[GL_TEXTURE_RECTANGLE] = "TEXTURE_RECTANGLE";

/*
 * Render layer buffer of the selected frame on the screen.
 *
 */
LayerScope.LayerBufferRenderer = {
  input: function LR_input(frame) {

    $("#framedisplay").empty();
    this._dumpTextureLayer(frame, $('#framedisplay'));
    this._dumpColorLayer(frame, $('#framedisplay'));
  },
  _dumpTextureLayer: function LR_dumpTextureLayer(frame, $panel) {
    for (let t of frame.textures) {
      let d = $("<div>").addClass("texture-pane").addClass(t.layerRef.low.toString());

      d.append($("<p>" + t.name + " &mdash; " +
            GLEnumNames[t.target] + " &mdash; "
            + t.width + "x" + t.height + "</p>").addClass("texture-info"));

      if (t.layerRef) {
        d.append($("<p>Layer " + LayerScope.utils.hex8(t.layerRef.low) + "</p>").addClass("texture-misc-info"));
      }

      if (t.imageData || t.imageDataURL) {
        let cs = $("<canvas>").addClass("texture-canvas").addClass("background-" + LayerScope.Config.background)[0];
        cs.width = t.width;
        cs.height = t.height;
        let cx = cs.getContext("2d");

        if (t.imageData) {
          // From realtime connection
          cx.putImageData(t.imageData, 0, 0);
        } else {
          // From files
          // Note: Image store in png file, acquire addon to load it
          if (t.imageDataURL.substring(0, 21) != "data:image/png;base64") {
            // Addon is created by our content script (Layerscope addon)
            // which would also export this function, readImageFromFile.
            if (typeof Addon != "undefined" && typeof Addon.readImageFromFile != "undefined") {
              Addon.readImageFromFile(t, cx);
            } else {
              let $log = $("#error-log").empty();
              $log.append("<p>Loading images failed.<br>\
                          If you are using layerscope addon, please make sure its version is correct.<br>\
                          If not, please make sure the format of this JSON file is correct.</p>");
            }
          } else {
            this._loadImageToCanvas(t, cx);
          }
        }
        d.append(cs);
      }
      $panel.append(d);
    }
  },
  _dumpColorLayer: function LR_dumpColoerLayer(frame, $panel) {
    for (let l of frame.colors) {
      let d = $("<div>").addClass("layer-pane").addClass(l.layerRef.low.toString());

      d.append($("<p>" + l.type + " Layer " + LayerScope.utils.hex8(l.layerRef.low) + " &mdash; " +
            + l.width + "x" + l.height + "</p>").addClass("layer-info"));

      if (l.type == "Color") {
        var bgdiv = $("<div>").addClass("layer-canvas").addClass("background-" + LayerScope.Config.background);
        let colordiv = $("<div>").width(l.width).height(l.height).css("background-color", LayerScope.utils.rgbaToCss(l.color));
        bgdiv.append(colordiv);
      }

      d.append(bgdiv);
      $panel.append(d);
    }
  },
  /**
  * Load images to canvas
  * @param {object} texture
  */
  _loadImageToCanvas: function R_loadImageToCanvas(texture, cx) {
    // convert from base64 to raw image buffer
    var img = $("<img>", { src: texture.imageDataURL });
    var loadingCanvas = $("<canvas>")[0];
    loadingCanvas.width = texture.width;
    loadingCanvas.height = texture.height;
    let context = loadingCanvas.getContext("2d");
    let temp = texture;
    img.load(function() {
      context.drawImage(this, 0, 0);
      temp.imageData = context.getImageData(0, 0, temp.width, temp.height);
      cx.putImageData(temp.imageData, 0, 0);
    });
  },
};

// Regist LayerBufferRenderer into RendererNode
LayerScope.RendererNode.register(LayerScope.LayerBufferRenderer);

// Layer Type Map
const gLayerNameMap = [
  "UnknownLayer",
  "LayerManager",
  "ContainerLayer",
  "PaintedLayer",
  "CanvasLayer",
  "ImageLayer",
  "ColorLayer",
  "RefLayer",
  "ReadbackLayer"
];

/*
 * Render the content of layer tree and the attribute of the
 * selected layer on the screen.
 *
 */
LayerScope.TreeRenderer = {
  input: function TR_input(frame) {
    // Three renderer cares about frame.layerTree only.
    if (frame.layerTree.length == 0){
      return;
    }

    // DFS print
    var dfs = function(node) {
      var $span = $("<span>");

      // Store data into this tag
      $span.data("layerValue", node.value);

      // Setting
      var isRoot = !node.value.parentPtr.low;
      var invisible = !node.value.region;
      if (invisible && !isRoot) {
        $span.addClass("layer-grayout");
      } else {
        $span.data("ptr", node.value.ptr.low);
        $span.mouseenter(highlight);
      }

      // Self info
      $span.append(gLayerNameMap[node.value.type] + "(" + LayerScope.utils.hex8(node.value.ptr.low) + ") ");
      if (isRoot) {
        $span.append("[root]");
      } else if (invisible) {
        $span.append("[non visible]");
      }
      var $li = $("<li>").append($span);

      // Children
      for (let child of node.children) {
        $li.append(dfs(child));
      }
      return $("<ul>").append($li);
    };

    var $d = $("<div>");
    for (let root of frame.layerTree) {
      $d.append(dfs(root));
    };

    // Append to layerdump div
    $("#layertree").empty();
    $("#layertree").append($d);
    $("#layerattr").empty();
  },
};

// Regist TreeRenderer into RendererNode
LayerScope.RendererNode.register(LayerScope.TreeRenderer);

// TBD:
// Don't spend time on the following function. I am going to 
// replace these functions by new UI template.

/**
 * highlight and unhighlight the specific layer image
 * Note: This function is used for jQuery mouseenter
 */
function highlight() {
  // Highlight text
  $(".highlight-text").removeClass("highlight-text");
  $(this).addClass("highlight-text");

  // Highligh images
  $(".highlight-pane").removeClass("highlight-pane");
  $("." + $(this).data("ptr").toString()).addClass("highlight-pane");

  // Append Attributes
  var $d = $("<div>");
  var $table = $("<table>").addClass("layerattr-table");
  var $tr = $("<tr>").addClass("layerattr-title").append("<td><strong>Layer Attributes</strong></td>");
  $table.append($tr);
  $tr = $("<tr>").append("<td><ul>" + showAttributes($(this).data("layerValue")).html() + "</ul></td>");
  $table.append($tr);
  $d.append($table);

  $("#layerattr").empty();
  $("#layerattr").append($d);
}
/**
 * Handle layer attribute and show them in html
 * @param {object} data The attribute data
 * @return ul tag with attributes
 */
function showAttributes(data) {
  // Filter Type Map
  const FilterMap = [
    "Fast",
    "Good",
    "Best",
    "Nearest",
    "Bilinear",
    "Gaussian",
    "Sentinel"
  ];
  // Show functions wrapper
  var showAttrWrapper = {
    showClip: // Create clip info
      function(clip) {
        return $("<li>Clip: (x=" + clip.x +
                          ", y=" + clip.y +
                          ", w=" + clip.w +
                          ", h=" + clip.h + ")</li>");
      },
    showTransform: // Create transform info
      function(transform) {
        let $li = $("<li>");
        if(transform.is2D) {
          if(transform.isID) {
            $li.append("Transform: 2D Identity");
          } else {
            $li.append("Transform: [");
            for (let i=0; i<6; i+=2) {
              $li.append(transform.m[i] + ", " + transform.m[i+1] + "; ");
            }
            $li.append("]");
          }
        } else {
          $li.append("Transform:<br>");
          for (let i=0; i<16; i+=4) {
              $li.append("[" + transform.m[i]   + ", " +
                               transform.m[i+1] + ", " +
                               transform.m[i+2] + ", " +
                               transform.m[i+3] + "]<br>");
          }
        }
        return $li;
      },
    showRegion: // Create region info
      function(region, name) {
        let $li = $("<li>");
        for (let r of region) {
          $li.append(name + ": (x=" + r.x +
                             ", y=" + r.y +
                             ", w=" + r.w +
                             ", h=" + r.h + ")<br>");
        }
        return $li;
      }
  };

  // OK, Let's start to show attributes
  var $ul = $("<ul>");
  var $li = $("<li>").append("Type: " + gLayerNameMap[data.type] + "Composite");
  if (!data.parentPtr.low) {
    $li.append(" [root]");
  }
  $ul.append($li);

  // Actually, only visible layers enter this function
  if (!!data.shadow) {
    let $sli = $("<li>").append("Shadow:");
    let $sul = $("<ul>");
    if (!!data.shadow.clip) {
      $sul.append(showAttrWrapper.showClip(data.shadow.clip));
    }
    if (!!data.shadow.transform) {
      $sul.append(showAttrWrapper.showTransform(data.shadow.transform));
    }
    if (!!data.shadow.region) {
      $sul.append(showAttrWrapper.showRegion(data.shadow.region, "Visible"));
    }
    $sli.append($sul);
    $ul.append($sli);
  }

  if (!!data.clip) {
    $ul.append(showAttrWrapper.showClip(data.clip));
  }

  if (!!data.transform) {
    $ul.append(showAttrWrapper.showTransform(data.transform));
  }

  if (!!data.region) {
    $ul.append(showAttrWrapper.showRegion(data.region, "Visible"));
  }

  if (!!data.opacity) {
    $ul.append("<li>Opacity: "+ data.opacity + "</li>");
  }

  if (!!data.opaque) {
    $ul.append("<li>[Content Opaque]</li>");
  }

  if (!!data.alpha) {
    $ul.append("<li>[Content Component Alpha]</li>");
  }

  if (!!data.direct) {
    let $li = $("<li>");
    if (data.direct === LayersPacket.Layer.ScrollingDirect.VERTICAL ) {
      $li.append("VERTICAL: ");
    } else {
      $li.append("HORIZONTAL: ");
    }
    $li.append("(id: " + LayerScope.utils.hex8(data.barID.low) + " )");
    $ul.append($li);
  }

  if (!!data.mask) {
    $ul.append("<li>Mask Layer: "+ LayerScope.utils.hex8(data.mask.low) + "</li>");
  }

  // Specific layer data
  // Valid (PaintedLayer)
  if (!!data.valid) {
    $ul.append(showAttrWrapper.showRegion(data.valid, "Valid"));
  }
  // Color (ColorLayer)
  if (!!data.color) {
    $ul.append("<li>Color: " + LayerScope.utils.rgbaToCss(data.color) +"</li>");
  }
  // Filter (CanvasLayer & ImageLayer)
  if (!!data.filter) {
    $ul.append("<li>Filter: " + FilterMap[data.filter] + "</li>");
  }
  // Ref ID (RefLayer)
  if (!!data.refID) {
    $ul.append("<li>ID: " + LayerScope.utils.hex8(data.refID.low) + "</li>");
  }
  // Size (ReadbackLayer)
  if (!!data.size) {
    $ul.append("<li>Size: (w=" + data.size.w +
                        ", h=" + data.size.h + ")</li>");
  }
  return $ul;
}

// LayerScope add-on backward compatible
// https://github.com/mephisto41/LayerScope-Addon
// Keep functions which are used by add-on
function loadImageToCanvas(texture, cx) {
  return LayerScope.LayerBufferRenderer._loadImageToCanvas(texture, cx);
}
