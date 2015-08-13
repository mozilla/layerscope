/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 *  * License, v. 2.0. If a copy of the MPL was not distributed with this
 *   * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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

LayerScope.DisplayItem.getMatrix2X3 = function(displayItem) {
  var matches = displayItem.line.match(".*\\[ (.*?) (.*?); (.*?) (.*?); (.*?) (.*?); \\].*$");
  if (!matches) {
    return null;
  }

  var matrix = [
    [parseFloat(matches[1]), parseFloat(matches[2])],
    [parseFloat(matches[3]), parseFloat(matches[4])],
    [parseFloat(matches[5]), parseFloat(matches[6])],
  ];

  return matrix;
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

LayerScope.DisplayItem.getBoundary = function(displayItem, unit) {
  //var bound = [(i / unit) for i of displayItem.layerBounds];//displayItem.layerBounds.slice();
  var bound = displayItem.layerBounds.slice();
  for (var i = 0; i < bound.length; i++) {
    bound[i] = bound[i] / unit;
  }
 
  return LayerScope.DisplayItem.ApplyTransform(displayItem, bound, unit);
}

LayerScope.DisplayItem.ApplyTransform = function(displayItem, region, unit) {
  // Apply transform.
  for (var item = displayItem.displayItemParent; item; item = item.displayItemParent) {
    if (item.name == "nsDisplayTransform") {

      var transform = item.layerBounds;
      region[0] += transform[0];
      region[1] += transform[1];

      //var matrix = LayerScope.DisplayItem.getMatrix2X3(item);
      // X is correct, Y shift up
      //region[0] += (matrix[2][0] * unit);
      //region[1] += (matrix[2][1] * unit);
    }
  }

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

    //this._applyTransform(root);
    return root;
  },

  /**
  * Apply transform into each display item.
  */
  _applyTransform: function DLB_applyTransform(displayItem) {
    if (displayItem.name == "nsDisplayTransform") {
      var transform = displayItem["layerBounds"];
    }

    for (var child of displayItem.children) {
      if (!!transform) {
        var bound = child["layerBounds"];
        //LayerScope.utils.log("bound = ", bound[0], bound[1]);
        bound[0] += transform[0];
        bound[1] += transform[1];
      }

      this._applyTransform(child);
    }
  }
};

