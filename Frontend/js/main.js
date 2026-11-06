class Algorithms {
  degree(graph, id) {
    return graph.edges.filter(function(e) { return e.from === id || e.to === id }).length
  }

  stOrdering(graph) {                               // picks s and t itself, returns { order } or { error }
    var ends = v1.pickEnds(graph)
    if (ends.error) return ends
    return v1.compute(graph, ends.s, ends.t)
  }
}

//______________________________ Start-up ______________________________
var TAB_BAR_HEIGHT = 48
var SIDEBAR_WIDTH  = 160

var canvas = document.getElementById('canvas')
canvas.width        = window.innerWidth - SIDEBAR_WIDTH
canvas.height       = window.innerHeight - TAB_BAR_HEIGHT
canvas.style.width  = canvas.width  + 'px'
canvas.style.height = canvas.height + 'px'

var editor     = new Editor(canvas)
var buttons    = new Buttons(editor)
var algorithms = new Algorithms()