/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 *  * License, v. 2.0. If a copy of the MPL was not distributed with this
 *   * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

LayerScope.utils = {
  /**
  * Log function
  * @param {string} s
  */
  _lines: 0,
  ll: function u_ll(s) {
    // For debugging
    //console.log(s);
    return;

    if(lines++ > 500){
      $("#log").empty();
      lines = 0;
    }

    $("#log").append($("<span>" + s + "</span><br>"));
  },
  /**
  * Convert rgba to css format
  * @param {number} val
  * @return {string} Color data in css format
  */
  rgbaToCss: function u_rgbaToCss(val) {
    // the value is abgr, little-endian packed
    var r = val & 0xff;
    var g = (val >>> 8) & 0xff;
    var b = (val >>> 16) & 0xff;
    var a = (val >>> 24) & 0xff;

    return "rgba(" + r + "," + g + "," + b + "," + a/255.0 + ")";
  },

  /**
  * Convert to Hex format (8)
  * @param {number} val
  * @return {string} String in hex format (8 bits)
  */
  hex8: function u_hex8(val) {
    return "0x" + this._pad0(val.toString(16), 8);
  },

  /**
  * Convert to Hex format (16)
  * @param {number} vh High bits
  * @param {number} vl Low bigs
  * @return {string} String in hex format (16 bits)
  */
  hex16: function u_hex16(vh, vl) {
    return "0x" + this._pad0(vh.toString(16), 8) + this._pad0(vl.toString(16), 8);
  },

  /**
  * Pad zeros
  * @param {string} s Any string
  * @param {number} cnt The number of 0
  * @return {string} Any string with "0" prefix
  */
  _pad0: function u_pad0(s, cnt) {
    while (s.length < cnt) {
      s = "0" + s;
    }
    return s;
  },
};
