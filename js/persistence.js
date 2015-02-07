
/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

LayerScope.Storage = {
  save: function S_save(frames, pool) {
    // Zip each image in TexturePool in a file.
    var zip = new JSZip();
    var canvas = $("<canvas>")[0];
    var ctx = canvas.getContext("2d");
    for (key in pool._cacheImages) {
      let tex = pool._cacheImages[key];
      canvas.width = tex.width;
      canvas.height = tex.height;
      ctx.putImageData(tex.imageData, 0, 0);
      var dataURL = canvas.toDataURL("image/png");
      zip.file("image/" + key + ".png",
               // remove MIME type.
               dataURL.substr(dataURL.indexOf(',') + 1),
               {base64: true});
    }

    // Zip layer tree.
    var json = JSON.stringify(frames);
    zip.file("layertree.json", json);

    // Save To file.
    let blob = zip.generate({type : "blob"});
    this._blobToFile(blob);
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

    // Reconstruct layer-tree. Easy.
    var frames = JSON.parse(zip.file("layertree.json").asText());

    // Reconstruct TexturePool.
    var pool = new LayerScope.TexturePool();
    // Collects all png files under image subfolder.
    var imageFiles = zip.filter(function(path, file) {
      var match = path.match(/image\/.*\.png$/);
      return match != null;
    });
    // image.load is not a sync call. Create a promise and return it
    // to the caller. The caller should define "then" function to
    // receive resolve callback.
    var loadedPromise = new Promise(
      function(resolve, reject) {
        var canvas = $("<canvas>")[0];
        var ctx = canvas.getContext("2d");
        var loaded = 0;
        $.each(imageFiles, function (index, entry) {
          // Extract filename as texture content hash key
          var match = entry.name.match(/image\/(.*)\.png$/);
          let key = match[1];
          let dataURL = "data:image/png;base64," +
                        JSZip.base64.encode(imageFiles[index].asBinary());

          // Generate texture object and put it into TexturePool.
          var img = $("<img>", { src: dataURL });
          img.load(function() {
            canvas.width = this.width;
            canvas.height = this.height;

            ctx.drawImage(this, 0, 0);
            let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            pool.addTexture(key, imageData, this.width, this.height);
            if (++loaded === imageFiles.length) {
              resolve([frames, pool]);
            }
          });
        });
      });

    return loadedPromise;
  }
}
