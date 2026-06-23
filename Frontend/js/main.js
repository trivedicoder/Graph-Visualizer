var canvas = document.getElementById('canvas')
var ctx    = canvas.getContext('2d')

var TAB_BAR_HEIGHT = 48
canvas.width        = window.innerWidth - 160
canvas.height       = window.innerHeight - TAB_BAR_HEIGHT
canvas.style.width  = canvas.width  + 'px'
canvas.style.height = canvas.height + 'px'

var vertices  = []
var edges     = []
var nextId    = 0
var nextEid   = 0
var undoStack = []
var redoStack = []
var graphs    = []
var activeGraph = -1
var mode      = 'add'
var firstPick = null
var RADIUS    = 18

//__________________________________________________________________________ History __________________________________________________________________________
function pushHistory() {
  undoStack.push({
    vertices: JSON.parse(JSON.stringify(vertices)),
    edges:    JSON.parse(JSON.stringify(edges)),
    nextId:   nextId,
    nextEid:  nextEid
  })
  redoStack = []
}

function undo() {
  if (undoStack.length === 0) return
  redoStack.push({
    vertices: JSON.parse(JSON.stringify(vertices)),
    edges:    JSON.parse(JSON.stringify(edges)),
    nextId:   nextId,
    nextEid:  nextEid
  })
  var state = undoStack.pop()
  vertices  = state.vertices
  edges     = state.edges
  nextId    = state.nextId
  nextEid   = state.nextEid
  firstPick = null
  syncCurrentGraph()
  draw()
}

function redo() {
  if (redoStack.length === 0) return
  undoStack.push({
    vertices: JSON.parse(JSON.stringify(vertices)),
    edges:    JSON.parse(JSON.stringify(edges)),
    nextId:   nextId,
    nextEid:  nextEid
  })
  var state = redoStack.pop()
  vertices  = state.vertices
  edges     = state.edges
  nextId    = state.nextId
  nextEid   = state.nextEid
  firstPick = null
  syncCurrentGraph()
  draw()
}

//__________________________________________________________________________ Graph tabs __________________________________________________________________________
function syncCurrentGraph() {
  if (activeGraph < 0 || activeGraph >= graphs.length) return
  var g      = graphs[activeGraph]
  g.vertices  = vertices
  g.edges     = edges
  g.nextId    = nextId
  g.nextEid   = nextEid
  g.undoStack = undoStack
  g.redoStack = redoStack
}

function switchToGraph(index) {
  syncCurrentGraph()
  activeGraph = index
  var g      = graphs[index]
  vertices   = g.vertices
  edges      = g.edges
  nextId     = g.nextId
  nextEid    = g.nextEid
  undoStack  = g.undoStack || []
  redoStack  = g.redoStack || []
  firstPick  = null
  renderTabs()
  draw()
}

function renderTabs() {
  var container = document.getElementById('tabs')
  container.innerHTML = ''
  graphs.forEach(function(graph, index) {
    var tab       = document.createElement('button')
    tab.textContent = graph.name
    tab.className   = 'tab' + (index === activeGraph ? ' active' : '')
    tab.addEventListener('click', function() { switchToGraph(index) })
    container.appendChild(tab)
  })
}

//__________________________________________________________________________ Drawing __________________________________________________________________________
function draw() {
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = '#444'
  ctx.lineWidth   = 1
  for (var x = 0; x < canvas.width; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
  }
  for (var y = 0; y < canvas.height; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
  }

  // Grid coordinate labels every 100px
  ctx.fillStyle = '#555'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (var lx = 100; lx < canvas.width; lx += 100) {
    ctx.fillText(lx, lx, 2)
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (var ly = 100; ly < canvas.height; ly += 100) {
    ctx.fillText(ly, 2, ly)
  }

  edges.forEach(function(e) {
    var from = getVertex(e.from)
    var to   = getVertex(e.to)
    if (!from || !to) return
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.strokeStyle = '#ff5555'
    ctx.lineWidth   = 4
    ctx.stroke()
  })

  vertices.forEach(function(v) {
    ctx.beginPath()
    ctx.arc(v.x, v.y, RADIUS, 0, 2 * Math.PI)
    ctx.fillStyle = (firstPick && firstPick.id === v.id) ? '#55ffff' : '#55aaff'
    ctx.fill()
    ctx.fillStyle = '#000'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(v.id, v.x, v.y)
  })
}

//__________________________________________________________________________ Utilities __________________________________________________________________________
function getVertex(id) {
  return vertices.find(function(v) { return v.id === id })
}

function getClickedVertex(x, y) {
  for (var i = vertices.length - 1; i >= 0; i--) {
    var v  = vertices[i]
    var dx = x - v.x, dy = y - v.y
    if (Math.sqrt(dx*dx + dy*dy) <= RADIUS) return v
  }
  return null
}

function getClickedEdge(x, y) {
  for (var i = 0; i < edges.length; i++) {
    var edge = edges[i]
    var from = getVertex(edge.from)
    var to   = getVertex(edge.to)
    if (!from || !to) continue
    if (distToSegment(x, y, from.x, from.y, to.x, to.y) < 8) return edge
  }
  return null
}

function distToSegment(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay
  var lenSq = dx*dx + dy*dy
  if (lenSq === 0) return Math.sqrt((px-ax)*(px-ax) + (py-ay)*(py-ay))
  var t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / lenSq))
  return Math.sqrt((px-(ax+t*dx))*(px-(ax+t*dx)) + (py-(ay+t*dy))*(py-(ay+t*dy)))
}

//__________________________________________________________________________ Save / Load __________________________________________________________________________
function saveGraph() {
  var graphData = JSON.stringify({ vertices: vertices, edges: edges })
  var blob = new Blob([graphData], { type: 'application/json' })
  var url  = URL.createObjectURL(blob)
  var a    = document.createElement('a')
  a.href   = url
  a.download = 'graph.json'
  a.click()
  URL.revokeObjectURL(url)
}

function loadGraph(intoNewTab) {
  var input  = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = function(event) {
    var file   = event.target.files[0]
    var reader = new FileReader()
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result)
        var verts = data.vertices || []
        var edgs  = data.edges    || []
        var nid   = verts.reduce(function(m, v)  { return Math.max(m, v.id)  }, -1) + 1
        var neid  = edgs.reduce(function(m, ed)  { return Math.max(m, ed.id) }, -1) + 1
        if (intoNewTab) {
          syncCurrentGraph()
          graphs.push({
            name: 'Graph ' + (graphs.length + 1),
            vertices: verts, edges: edgs, nextId: nid, nextEid: neid,
            undoStack: [], redoStack: []
          })
          switchToGraph(graphs.length - 1)
        } else {
          pushHistory()
          vertices  = verts
          edges     = edgs
          nextId    = nid
          nextEid   = neid
          firstPick = null
          syncCurrentGraph()
          draw()
        }
      } catch (err) {
        alert('Invalid graph file')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

//__________________________________________________________________________ Canvas click handler __________________________________________________________________________
canvas.addEventListener('click', function(event) {
  var rect = canvas.getBoundingClientRect()
  var x    = event.clientX - rect.left
  var y    = event.clientY - rect.top

  var cv = getClickedVertex(x, y)
  var ce = getClickedEdge(x, y)

  if (cv) {
    document.getElementById('hint').textContent =
      'Vertex ' + cv.id + '  (' + Math.round(cv.x) + ', ' + Math.round(cv.y) + ')'
  }

  if (mode === 'add') {
    if (cv) return
    pushHistory()
    vertices.push({ id: nextId++, x: x, y: y })
    syncCurrentGraph()
    draw()
    return
  }

  if (mode === 'edge') {
    if (!cv) return
    if (firstPick === null) {
      firstPick = cv
      draw()
    } else {
      if (firstPick.id !== cv.id) {
        pushHistory()
        edges.push({ id: nextEid++, from: firstPick.id, to: cv.id })
        syncCurrentGraph()
      }
      firstPick = null
      draw()
    }
    return
  }

  if (mode === 'delete') {
    if (cv) {
      pushHistory()
      vertices  = vertices.filter(function(v) { return v.id !== cv.id })
      edges     = edges.filter(function(e) { return e.from !== cv.id && e.to !== cv.id })
      syncCurrentGraph()
      draw()
    } else if (ce) {
      pushHistory()
      edges = edges.filter(function(e) { return e.id !== ce.id })
      syncCurrentGraph()
      draw()
    }
  }
})

//__________________________________________________________________________ Button handlers __________________________________________________________________________
document.getElementById('btnAdd').addEventListener('click', function() {
  mode = 'add'; firstPick = null
  document.getElementById('hint').textContent = 'Click on canvas to add vertices'
})
document.getElementById('btnEdge').addEventListener('click', function() {
  mode = 'edge'; firstPick = null
  document.getElementById('hint').textContent = 'Click two vertices to connect them'
})
document.getElementById('btnDelete').addEventListener('click', function() {
  mode = 'delete'; firstPick = null
  document.getElementById('hint').textContent = 'Click on a vertex or edge to delete it'
})
document.getElementById('btnClear').addEventListener('click', function() {
  pushHistory()
  vertices = []; edges = []; nextId = 0; nextEid = 0; firstPick = null
  syncCurrentGraph()
  draw()
})
document.getElementById('btnSave').addEventListener('click', function() {
  saveGraph()
  mode = 'add'; firstPick = null
  document.getElementById('hint').textContent = 'Click on canvas to add vertices'
})
document.getElementById('btnLoad').addEventListener('click', function() {
  var intoNewTab = confirm('Load graph into a new tab?\n\nOK = New tab\nCancel = Replace current graph')
  loadGraph(intoNewTab)
  mode = 'add'; firstPick = null
  document.getElementById('hint').textContent = 'Click on canvas to add vertices'
})
document.getElementById('btnNew').addEventListener('click', function() {
  syncCurrentGraph()
  var newGraph = {
    name: 'Graph ' + (graphs.length + 1),
    vertices: [], edges: [], nextId: 0, nextEid: 0,
    undoStack: [], redoStack: []
  }
  graphs.push(newGraph)
  switchToGraph(graphs.length - 1)
})
document.getElementById('btnundo').addEventListener('click', function() {
  undo()
  document.getElementById('hint').textContent = 'Undone'
})
document.getElementById('btnredo').addEventListener('click', function() {
  redo()
  document.getElementById('hint').textContent = 'Redone'
})

//__________________________________________________________________________ Init __________________________________________________________________________
graphs.push({ name: 'Graph 1', vertices: [], edges: [], nextId: 0, nextEid: 0, undoStack: [], redoStack: [] })
switchToGraph(0)
