/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 *  * License, v. 2.0. If a copy of the MPL was not distributed with this
 *   * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespace for LayerScope globals
if (typeof LayerScope == "undefined" || !LayerScope) {
  LayerScope = {};
}

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
  _graph: null,

  init: function TR_init(graph) {
    $('#property-table').dataTable({
      "scrollY":        "300px",
      "scrollCollapse": true,
      "paging":         false,
      //"pageLength":     10,
      "columns": [ {"width": "40%"}, {"width": "60%"} ],
      "fnRowCallback": function(nRow, aData, iDisplayIndex, nDisplayIndexFull) {
        if (aData[0].search("Shadow") == 0) {
          $('td', nRow).css({"background-color" : "DarkCyan"});
          $('td:eq(0)', nRow).html("<b>" + aData[0] + "</b>");
          //$(nRow).css({"background-color" : "blue"})
        }
      }
    });
    LayerScope.MessageCenter.subscribe("layer.select", this);
    LayerScope.MessageCenter.subscribe("buffer.select", this);

    this._graph = graph;
  },

  begin: function LR_begin() {
    $("#tree-pane").empty();

    // Clear is not enough, we need to force draw here.
    $("#property-table").DataTable().clear();
    $("#property-table").DataTable().draw();
  },

  input: function TR_input(frame) {
    if (frame.layerTree.length == 0) {
      $("#tree-pane").empty();
      $("#property-table").DataTable().clear();

      return;
    }

    this._drawLayerTree(frame, $("#tree-pane"));
  },

  notify: function LR_notify(name, id) {
    if (name === "layer.select") {
      this._drawProperty(id);
    } else if (name === "buffer.select") {
      let children = $("#jsTreeRoot").find("li");

      for (let i = 0; i < children.length; i++) {
        if ($(children[i]).attr("data-layer-id") == id) {
          let ids = $("#jsTreeRoot").jstree('get_selected');
          if (ids[0] !== id) {
            // deselect the original node.
            $("#jsTreeRoot").jstree(true).deselect_node($("#" + ids[0]));
            // Select the new node.
            $("#jsTreeRoot").jstree(true).select_node(children[i]);
          }

          break;
        }
      }

      this._drawProperty(id);
    }
  },

  _drawProperty: function RT_drawProperty(id) {
    // Clear Layer property table.
    var $table = $("#property-table").DataTable()
    $table.clear();

    var layer = LayerScope.FrameUtils.findLayerByID(this._graph.frame, id);
    if (!!layer) {
      // Display properties of the selected layer.
      var dataSet = [];
      generateLayerAttributes(layer.value, dataSet);
      if (dataSet.length > 0) {
        for (let i = 0; i< dataSet.length; i++) {
          $table.row.add(dataSet[i]);
        }
      }
    }

    $table.draw();
  },

  _drawLayerTree: function TR_dumpLayerTree(frame, $pane) {
    var $treeRoot = $('<div id="jsTreeRoot">');
    for (let root of frame.layerTree) {
      $treeRoot.append(function createTreeNode(node) {
        // Put layer name tag in span.
        let $span = $("<span>");
        $span.append(gLayerNameMap[node.value.type] + "(" +
            LayerScope.utils.hex8(node.value.ptr.low) + ") ");

        // Create tree-ish
        let isRoot = !node.value.parentPtr.low;
        let invisible = !node.value.region;
        let $li = $("<li>").append($span);
        $li.attr("data-jstree", node.children.length ?
                 '{"icon":"css/layers-icon.png"}' :
                 '{"icon":"css/texture-icon.png"}')
           .attr("data-layer-id", node.value.ptr.low)
           .addClass(invisible && !isRoot ? "invisible-layer" : "visible-layer");

        for (let child of node.children) {
          $li.append(createTreeNode(child));
        }

        return $("<ul>").append($li);
      }(root));
    }

    // Append to layerdump div.
    // For unknow reasons, we have to append $d _before_ makes it as a jstree.
    $pane.empty();
    $pane.append($treeRoot);

    // TODO:
    // The right thing here is to replace li/ul insertion by jstree/JSON.
    // I will do the change later.
    $treeRoot.bind("loaded.jstree", function(event, data) {
      // We expect open all folder nodes in the tree.
      data.instance.open_all();
    }).bind("select_node.jstree", function(event) {
      var ids = $("#jsTreeRoot").jstree('get_selected');
      console.assert(ids.length == 1);
      let $li = $("#" + ids[0]);

      if ($li.hasClass("invisible-layer")) {
        // Deselect and clear property table
        $("#jsTreeRoot").jstree(true).deselect_node($li);
        LayerScope.MessageCenter
                  .fire("layer.select", null);
      } else {
        // Display the property of the selected node.
        LayerScope.MessageCenter
                  .fire("layer.select", $li.attr("data-layer-id"));
      }
    }).jstree();
  },
};

// Regist TreeRenderer into RendererNode
LayerScope.RendererNode.register(LayerScope.TreeRenderer);

// TBD:
// Functions needs to be clean up. Don't add lines of code beneath this line.

/**
 * Handle layer attribute and show them in html
 * @param {object} data The attribute data
 * @return ul tag with attributes
 */
function generateLayerAttributes(data, dataSet) {
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
  var convertor = {
    clip: function(clip, name) {
      dataSet.push( [
          name,
          "x=" + clip.x +
          " y=" + clip.y +
          " w=" + clip.w +
          " h=" + clip.h
      ])
    },
    transform: function(transform, name) {
      if(transform.is2D) {
        if(transform.isID) {
          dataSet.push([
            "Transform",
            "2D Identity"]);
        } else {
          let value = "";
          for (let i=0; i<6; i+=2) {
            value += "(" + transform.m[i] + ", " + transform.m[i+1] + "); ";
          }

          dataSet.push([name, value]);
        }
      } else {
        let value = "";
        for (let i=0; i<16; i+=4) {
            value += "[" + transform.m[i]   + ", " + transform.m[i+1] + ", " +
                     transform.m[i+2] + ", " + transform.m[i+3] + "]";
        }
        dataSet.push([name, value]);
      }
    },
    region: function(region, name) {
      let value = ""
      for (let r of region) {
        value += "x=" + r.x + " y=" + r.y +
                 " w=" + r.w + " h=" + r.h + "<br>";
      }

      dataSet.push([name,value]);
    }
  };

  // Shadow layer.
  //http://datatables.net/examples/api/row_details.html
  // Actually, only visible layers enter this function
  if (!!data.shadow) {
    if (!!data.shadow.clip) {
      convertor.clip(data.shadow.clip, "Shadow Clip");
    }
    if (!!data.shadow.transform) {
     convertor.transform(data.shadow.transform, "Shadow Transform");
    }
    if (!!data.shadow.region) {
      convertor.region(data.shadow.region, "Shadow Visible");
    }
  }

  // Common layer properties
  if (!!data.clip) {
    convertor.clip(data.clip, "Clip");
  }
  if (!!data.transform) {
    convertor.transform(data.transform, "Transform");
  }
  if (!!data.region) {
    convertor.region(data.region, "Visible");
  }

  if (!!data.opacity) {
    dataSet.push(["Opacity", data.opacity]);
  }

  dataSet.push(["Opaque", (!!data.opaque) ? "True" : "False"]);
  dataSet.push(["Component Alpah", (!!data.alpha) ? "True" : "False"]);

  if (!!data.direct) {
    let vertical = (data.direct === LayersPacket.Layer.ScrollingDirect.VERTICAL);
    let value = "id: " + LayerScope.utils.hex8(data.barID.low);
    dataSet.push([vertical ? "VERTICAL" : "HORIZONTAL", value]);
  }

  if (!!data.mask) {
    let value = LayerScope.utils.hex8(data.mask.low);
    dataSet.push(["Mask Layer", value]);
  }

  if (!!data.valid) {
    convertor.region(data.valid, "Valid Region");
  }

  // Specific layer property
  // Color (ColorLayer)
  if (!!data.color) {
    dataSet.push(["Color", LayerScope.utils.rgbaToCss(data.color)]);
  }
  // Filter (CanvasLayer & ImageLayer)
  if (!!data.filter) {
    dataSet.push(["Filter", FilterMap[data.filter]]);
  }
  // Ref ID (RefLayer)
  if (!!data.refID) {
    dataSet.push(["ID", LayerScope.utils.hex8(data.refID.low)]);
  }
  // Size (ReadbackLayer)
  if (!!data.size) {
    let value = "w=" + data.size.w + ", h=" + data.size.h + "";
    dataSet.push(["Size", value]);
  }
}
