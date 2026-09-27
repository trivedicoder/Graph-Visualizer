
//______________________________ Algorithms ______________________________
// Each algorithm takes a Graph and reads graph.vertices / graph.edges.
// This is only for algorithms that don't modify the graph. For algorithms that do modify the graph, use the methods in Graph.js instead.

class Algorithms {
  degree(graph, id) {                               // number of edges touching a vertex (example)
    return graph.edges.filter(function(e) { return e.from === id || e.to === id }).length
  }
}

//______________________________ Start-up ______________________________
var TAB_BAR_HEIGHT = 48         // height of the tab bar under the canvas
var SIDEBAR_WIDTH  = 160        // width of the button sidebar

var canvas = document.getElementById('canvas')
canvas.width        = window.innerWidth - SIDEBAR_WIDTH
canvas.height       = window.innerHeight - TAB_BAR_HEIGHT
canvas.style.width  = canvas.width  + 'px'
canvas.style.height = canvas.height + 'px'

var editor     = new Editor(canvas)
var buttons    = new Buttons(editor)
var algorithms = new Algorithms()