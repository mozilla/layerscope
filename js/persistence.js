
/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

LayerScope.Storage = {
  _$progressbar: null,
  _$dialog: null,

  _progressShow: function S_progressShow(totalTasks, title) {
    // Create progress bar.
    var $progressbar = $("<div>");
    $progressbar.progressbar({
      value: 0,
      max: totalTasks,
      change: function() {
        let percent = Math.round($progressbar.progressbar("value") * 100
                      / totalTasks);
        $label.text(percent + "%");
      }
    });

    // Create progress label
    var $label = $("<div>").addClass("progress-label");

    // Create dialog and append progress bar/label into.
    var $dialog = $("<div>");
    $dialog.append($label);
    $dialog.append($progressbar);
    var dialogWidth = $(window).width() / 2;
    $dialog.dialog({
      dialogClass: "no-close",
      title: title,
      width: dialogWidth,
      modal: true });

    this._$progressbar = $progressbar;
    this._$dialog = $dialog;
  },

  _progressAdvance: function S_progressAdvance() {
    var value = this._$progressbar.progressbar("value");
    this._$progressbar.progressbar("value", ++value);
  },

  _progressHide: function S_progressHide() {
    this._$dialog.remove();
    this._$progressbar = this._$dialog = null;
  },

  /*
   * Solution here is too slow.
   * https://github.com/douglascrockford/JSON-js/blob/master/cycle.js
   * Before I find a better library to fix cyclic problem, manually rebuild
   * displayItem patent-child relation.
   */
  _rebuildDisplayList: function S_rebuildDisplayList(frames) {
    for (let frame of frames) {
    for (let root of frame.layerTree) {
      (function iterateLayer(layer) {
        (function iterateDisplayItem(item) {
          if (!item) {
            return;
          }
          for (let childItem of item.children) {
            childItem.displayItemParent = item;
            iterateDisplayItem(childItem);
          }
        }(layer.value.displayList));
        for (let child of layer.children) {
          iterateLayer(child);
        }
      }(root));
    }
    }
  },

  save: function S_save(frames, pool) {
    var totalTask = Object.keys(pool._cacheImages).length
                    + 2 /* pacakge layertree and zip generation*/;

    LayerScope.TaskChain.empty();
    this._progressShow(totalTask, "Saving");

    // Zip each image in ImageDataPool in a file.
    var zip = new JSZip();
    var canvas = $("<canvas>")[0];
    var ctx = canvas.getContext("2d");
    var index = 0;
    for (key in pool._cacheImages) {
      let tex = pool._cacheImages[key];
      LayerScope.TaskChain.addTask(function(_arg) {
        let key = _arg[0];
        let imageData = _arg[1];
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        ctx.putImageData(imageData, 0, 0);
        let dataURL = canvas.toDataURL("image/png");
        zip.file("image/" + key + ".png",
                 // remove MIME type.
                 dataURL.substr(dataURL.indexOf(',') + 1),
                 {base64: true});
        this._progressAdvance();
      }.bind(this), [key, tex]);
    }

    // Zip layer tree.
    LayerScope.TaskChain.addTask(function() {
      var json = JSON.stringify(frames,
        // Prevent cyclic save.
        function (key, value) {
          if (key === "displayItemParent") {
            return undefined;
          }
          return value;
        });

      zip.file("layertree.json", json);
      this._progressAdvance();
    }.bind(this));

    // Save To file.
    LayerScope.TaskChain.addTask(function() {
      let blob = zip.generate({type : "blob"});
      this._progressAdvance();
      this._progressHide();
      this._blobToFile(blob);
    }.bind(this), ++index);

    LayerScope.TaskChain.start();
  },

  _blobToFile: function S_blobToFile(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.download = "layerscope.zip";
    a.href = url;
    a.textContent = "Download layerscope.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  load: function S_load(data) {
    var zip = new JSZip(data);
    // Collects all png files under image subfolder.
    var imageFiles = zip.filter(function(path, file) {
      var match = path.match(/image\/.*\.png$/);
      return match != null;
    });

    var totalTask = imageFiles.length/*Load texture*/ + 1/*Load layertree*/;

    LayerScope.TaskChain.empty();

    var taskIndex = 0;
    var frames = null;

    // Reconstruct layer-tree. Easy.
    var layerTree = zip.file("layertree.json");
    if (!layerTree) {
      throw "Invalid saved file";
    }
    LayerScope.TaskChain.addTask(function(index) {
      this._progressShow(totalTask, "Loading");
      frames = JSON.parse(layerTree.asText());
      this._rebuildDisplayList(frames);
      this._progressAdvance();
    }.bind(this), ++taskIndex);

    // Reconstruct ImageDataPool.
    var pool = new LayerScope.ImageDataPool();

    // image.load is not a sync call. Create a promise and return it
    // to the caller. The caller should define "then" function to
    // receive resolve callback.
    return new Promise(function(resolve, reject) {
      var canvas = $("<canvas>")[0];
      var ctx = canvas.getContext("2d");
      var loaded = 0;
      $.each(imageFiles, function (index, entry) {
        LayerScope.TaskChain.addTask(function(taskIndex) {
          // Extract filename as texture content hash key
          var match = entry.name.match(/image\/(.*)\.png$/);
          let key = match[1];
          let dataURL = "data:image/png;base64," +
                        JSZip.base64.encode(imageFiles[index].asBinary());

          // Generate texture object and put it into ImageDataPool.
          var img = $("<img>", { src: dataURL });
          function loadImage(loader) {
            img.load(function() {
              canvas.width = this.width;
              canvas.height = this.height;

              ctx.drawImage(this, 0, 0);
              let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

              pool.add(key, imageData);
              loader._progressAdvance();
              if (++loaded === imageFiles.length) {
                loader._progressHide();
                resolve([frames, pool]);
              }
            });
          };
          loadImage(this);
        }.bind(this), ++taskIndex);
      }.bind(this));
      LayerScope.TaskChain.start();
    }.bind(this));
  }
}
