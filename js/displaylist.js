/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

LayerScope.DisplayItem = function (name, line, address) {
  this.name = name;
  this.line = line;
  this.address = address;

  this.displayItemParent = null;
  this.children = [];
  this.layer = null;
  this.index = 0;
}

LayerScope.DisplayItem.reIndex = function (displayItem) {
  var index = 0
  displayItem.index = index++;
  (function indexNext(item) {
    for (var child of item.children) {
      indexNext(child);
      child.index = index++;
    }
  })(displayItem);
}

LayerScope.DisplayItem.getTransform = function(displayItem) {
  // Transfrom matrix can be 2D or 3D.
  // 1. 2D. Matrix
  var matches = displayItem.line.match(".*\\[ (.*?) (.*?); (.*?) (.*?); (.*?) (.*?); \\].*$");
  if (matches) {
    var mat = mat2d.create();
    mat[0] = parseFloat(matches[1]);
    mat[1] = parseFloat(matches[2]);
    mat[2] = parseFloat(matches[3]);
    mat[3] = parseFloat(matches[4]);
    mat[4] = parseFloat(matches[5]);
    mat[5] = parseFloat(matches[6]);

    return mat;
  }

  // 2. 3D. Matrix4X4
  matches = displayItem.line.match(".*\\[ (.*?) (.*?) (.*?); (.*?) (.*?) (.*?); (.*?) (.*?) (.*?); \\].*$");
  if (matches) {
    var mat = mat2d.create();

    mat[0] = parseFloat(matches[1]);
    mat[1] = parseFloat(matches[2]);
    mat[2] = parseFloat(matches[4]);
    mat[3] = parseFloat(matches[5]);
    mat[4] = parseFloat(matches[7]);
    mat[5] = parseFloat(matches[8]);

    return mat;
  }

  // No transform matrix log or something that we don't understand.
  return null;
}

LayerScope.DisplayItem.getHitRegion = function(displayItem) {
  var matches =
    displayItem.line.match(".*\\(hitRegion < \\(x=(\\w+), y=(\\w+), w=(\\w+), h=(\\w+)\\); >\\).*$");
  if (!matches) {
    return null;
  }

  var bound = [matches[1], matches[2], matches[3], matches[4]];
  return LayerScope.DisplayItem.ApplyTransform(displayItem, bound);
}

LayerScope.DisplayItem.getBoundary = function(displayItem, layer, unit) {
  var region = [ (i / unit) for (i of displayItem.layerBounds)];
  return LayerScope.DisplayItem.ApplyTransform(displayItem, region, layer, unit);
}

LayerScope.DisplayItem.ApplyTransform = function(displayItem, region, layer, unit) {
  // Fetch (left, top) point and (right, bottom) point from region.
  var pos = vec2.create();
  pos[0] = region[0];
  pos[1] = region[1];
  var pos2 = vec2.create();
  pos2[0] = region[0] + region[2];
  pos2[1] = region[1] + region[3];

  for (var item = displayItem.displayItemParent;
       item;
       item = item.displayItemParent) {
    if (item.name == "nsDisplayTransform") {
      var contentbounds = item.contentbounds ?
                          item.contentbounds[0] : item.bounds[0];
      // offset is a reference-frame-toanimation-root-frame vector..
      var offset = vec2.create();
      offset[0] = (item.layerBounds[0] - contentbounds) / unit;
      contentbounds = item.contentbounds ?
                      item.contentbounds[1] : item.bounds[1];
      offset[1] = (item.layerBounds[1] - contentbounds) / unit;

      // mat is a displayitem-to-reference-frame transfrom.
      var mat = LayerScope.DisplayItem.getTransform(item);

      // mat2d && mat.
      if (mat && mat.length == 6) {
        mat2d.translate(mat, mat, offset);
        vec2.transformMat2d(pos, pos, mat);
        vec2.transformMat2d(pos2, pos2, mat);
      }
    }
  }

  // Convert (left, top) and (right, bttom) back to region.
  region[0] = pos[0];
  region[1] = pos[1];
  region[2] = pos2[0] - pos[0];
  region[3] = pos2[1] - pos[1];

  return region;
}

LayerScope.DisplayItem.isVisual = function (displayItem) {
  // List invisible items here.
  var invisibleItems = [
    "nsDisplayTransform",
    "LayerEventRegions"
  ]

  var index = invisibleItems.indexOf(displayItem.name);
  return (index == -1) ? true : false;
}

LayerScope.DisplayItem.findByIndex = function (displayItem, index) {
  return (function advance(item) {
    if (item.index == index) {
      return item;
    }

    for (var child of item.children) {
      var found = advance(child);
      if (!!found) {
        return found;
      }
    }
  })(displayItem);
}

LayerScope.DisplayItem.childrenCount = function (displayItem) {
  var total = displayItem.children.length;

  for (var child of displayItem.children) {
    total += LayerScope.DisplayItem.childrenCount(child);
  }

  return total;
}

LayerScope.DisplayRoot = function () {
  LayerScope.DisplayItem.call(this,
                              "DisplayListRoot",
                              "DisplayListRoot p",
                              "0x0");
}

LayerScope.DisplayRoot.prototype =
  Object.create(LayerScope.DisplayItem.prototype);

// Build display list objects from dump log of gecko.
LayerScope.DisplayListBuilder = {
  build: function DLB_build(log)
  {
    // Convert log into lines.
    var lines = this._lineSplit(log);

    // Get the address of content layer
    var contentLayer = lines.shift();

    // Gernerate display items.
    var root = this._parseLines(lines);

    return [contentLayer, root];
  },

  _lineSplit: function DLB_lineSplit(log)
  {
    var lines = [];
    var line = "";
    for (var i = 0; i < log.length; i++) {
      if (log[i] == '\n') {
        lines.push(line);
        line = "";
      }

      line += log[i];
    }

    return lines;
  },

  /**
   * Steal from cleopatra:
   * https://github.com/bgirard/cleopatra/blob/master/js/layerTreeView.js
   */
  _parseLines: function DLB_parseLines(lines)
  {
    var root = new LayerScope.DisplayRoot();

    var objectAtIndentation = {
      "-1": root,
    };

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Example
      // (1)SolidColor(2) p=0x116dc4e00(3)
      // f=0x1284a6380(4)(RootBox(window)(-1) id:main-window)
      // bounds(0,0,86160,52620) layerBounds(0,0,86160,52620) visible(0,0,0,0)
      // componentAlpha(0,0,0,0) clip()  uniform (opaque 0,0,86160,52620) (rgba
      // 128,128,128,255)
      // layer=0x12a3d9000(9)(8)
      // apeend typed display item information.
      //var matches = line.match("(\\s*)(\\w+)\\sp=(\\w+)\\sf=(0x[a-f0-9]+)(\\[.*?\\])\\s(z=(\\w+)\\s)?(.*?)?( layer=(\\w+))?$");
      // Original version.
      var matches = line.match("(\\s*)(\\w+)\\sp=(\\w+)\\sf=(.*?)\\s(z=(\\w+)\\s)?(.*?)?( layer=(\\w+))?$");
      if (!matches) {
        LayerScope.utils.log("Failed to match: " + line);
        continue;
      }
      var displayItem = new LayerScope.DisplayItem(matches[2], line, matches[3]);

      if (!root) {
        root = displayItem;
      }

      var indentation = Math.floor(matches[1].length / 2);
      objectAtIndentation[indentation] = displayItem;
      var parent = objectAtIndentation[indentation - 1];
      if (parent) {
        parent.children.push(displayItem);
        displayItem.displayItemParent = parent;
      }

      displayItem.frame = matches[4];
      displayItem.content = matches[5]
      if (!!matches[6])
        displayItem.z = matches[6];
      var rest = matches[7];
      // New version
      /*if (!!matches[7])
        displayItem.z = matches[7];
      var rest = matches[8];*/
      displayItem.rest = rest;
      // Old version
      if (matches[9]) { // WrapList don't provide a layer
        displayItem.layer = matches[9];
      }
      // New version
      /*if (matches[10]) { // WrapList don't provide a layer
        displayItem.layer = matches[10];
      }*/

      // the content node name doesn't have a prefix, this makes the parsing easier
      rest = "content" + rest;

      var fields = {};
      var nesting = 0;
      var startIndex;
      var lastSpace = -1;
      var lastFieldStart = -1;
      for (var j = 0; j < rest.length; j++) {
        if (rest.charAt(j) == '(') {
          nesting++;
          if (nesting == 1) {
            startIndex = j;
          }
        } else if (rest.charAt(j) == ')') {
          nesting--;
          // Error handling. A ")" without paired "(";
          if (nesting < 0) {
            nesting = 0;
          }
          else if (nesting == 0) {
            var name = rest.substring(lastSpace + 1, startIndex);
            var value = rest.substring(startIndex + 1, j);

            var rectMatches = value.match("^(.*?),(.*?),(.*?),(.*?)$")
            if (rectMatches) {
              displayItem[name] = [
                parseFloat(rectMatches[1]),
                parseFloat(rectMatches[2]),
                parseFloat(rectMatches[3]),
                parseFloat(rectMatches[4]),
              ];
            } else {
              displayItem[name] = value;
            }
          }
        } else if (nesting == 0 && rest.charAt(j) == ' ') {
          lastSpace = j;
        }
      }
      //dump("FIELDS: " + JSON.stringify(fields) + "\n");
      //console.log("layerBounds ?", displayItem.layerBounds);
    }

    return root;
  }
};

