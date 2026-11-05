//__________________________________________________________________________ Editor __________________________________________________________________________
// The canvas: the grid, drawing, and mouse clicks/hover.
// Edits one Graph at a time (whichever tab is open).

class Editor {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx    = canvas.getContext('2d')

    this.RADIUS = 18            // vertex circle size
    this.GRID   = 50            // pixels between grid points
    this.ORIGIN = 50            // gap from the canvas edge to grid point (0,0)

    this.graph       = null     // the graph being edited (set by Buttons)
    this.mode        = 'add'    // 'add', 'edge', or 'delete'
    this.firstPickId = null     // first vertex picked in edge mode
    this.hoveredId   = null     // vertex under the mouse
    this.contact     = null     // { rectangles, width, height } while showing a contact representation
    this.contactPoles = null    // { north, east, south, west } of the shown representation

    // Arrow functions (=>) keep "this" pointing at the Editor inside the handler
    canvas.addEventListener('click',      (e) => this.handleClick(e))
    canvas.addEventListener('mousemove',  (e) => this.handleMouseMove(e))
    canvas.addEventListener('mouseleave', ()  => this.setHovered(null))
  }

  setGraph(graph) {                                 // show a different graph (used by tabs)
    this.graph       = graph
    this.firstPickId = null
    this.hoveredId   = null
    this.contact     = null
    this.draw()
  }

  setMode(mode) {
    this.mode        = mode
    this.firstPickId = null
    this.contact     = null
    this.draw()
  }

  // Show a rectangular dual (grid units) instead of the graph; any mode button goes back.
  showContactRepresentation(rectangles, size) {
    this.contact = rectangles ? { rectangles: rectangles, width: size.width, height: size.height } : null
    this.draw()
  }

  //______________________________ Grid ______________________________
  snap(p) {                                         // pixel -> pixel of the nearest grid point
    return Math.round((p - this.ORIGIN) / this.GRID) * this.GRID + this.ORIGIN
  }

  toCoord(p) {                                      // pixel -> grid coordinate (e.g. 100 -> 1)
    return Math.round((p - this.ORIGIN) / this.GRID)
  }

  //______________________________ Drawing ______________________________
  draw() {                                          // redraw everything from scratch
    if (this.contact) {
      this.drawContactRepresentation()
      return
    }
    var hv = this.graph.getVertex(this.hoveredId)   // hovered vertex, if any
    this.drawBackground()
    this.drawGrid(hv)
    this.drawEdges()
    this.drawVertices()
    if (hv) this.drawCoordLabel(hv)
  }

  drawBackground() {
    this.ctx.fillStyle = 'black'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
  }

  drawGrid(hv) {                                    // lines through the hovered vertex are brighter
    var ctx = this.ctx
    var w   = this.canvas.width
    var h   = this.canvas.height
    ctx.lineWidth = 1
    for (var x = this.ORIGIN; x < w; x += this.GRID) {        // vertical lines
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h)
      ctx.strokeStyle = (hv && hv.x === x) ? '#888' : '#444'
      ctx.stroke()
    }
    for (var y = this.ORIGIN; y < h; y += this.GRID) {        // horizontal lines
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y)
      ctx.strokeStyle = (hv && hv.y === y) ? '#888' : '#444'
      ctx.stroke()
    }
  }

  drawEdges() {
    var ctx   = this.ctx
    var graph = this.graph
    graph.edges.forEach(function(e) {
      var from = graph.getVertex(e.from)
      var to   = graph.getVertex(e.to)
      if (!from || !to) return
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.strokeStyle = '#ff5555'
      ctx.lineWidth   = 4
      ctx.stroke()
    })
  }

  drawVertices() {
    var ctx         = this.ctx
    var radius      = this.RADIUS
    var firstPickId = this.firstPickId
    this.graph.vertices.forEach(function(v) {
      ctx.beginPath()
      ctx.arc(v.x, v.y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = (v.id === firstPickId) ? '#55ffff' : '#55aaff'   // brighter if picked for an edge
      ctx.fill()
      ctx.fillStyle    = '#000'
      ctx.font         = 'bold 12px sans-serif'
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(v.id, v.x, v.y)
    })
  }

  drawContactRepresentation() {                    // rectangles scaled to fit the canvas
    var ctx     = this.ctx
    var contact = this.contact
    var margin  = this.ORIGIN
    var scale   = Math.min((this.canvas.width - 2 * margin) / contact.width,
                           (this.canvas.height - 2 * margin) / contact.height)
    var frame   = '#9b7fc4'                                     // outer frame (v_N, v_E, v_S, v_W)
    var colors  = ['#55aaff', '#55cc99', '#ffaa55', '#bb88ff', '#ff7799']
    var outer   = this.contactPoles || {}
    var poleIds = [outer.north, outer.east, outer.south, outer.west].map(String)

    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    Object.values(contact.rectangles).forEach(function(r, index) {
      var x = margin + r.x * scale
      var y = margin + r.y * scale
      var w = r.width * scale
      var h = r.height * scale
      ctx.fillStyle = poleIds.indexOf(String(r.id)) >= 0 ? frame : colors[index % colors.length]
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, w, h)
      ctx.fillStyle = '#000000'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(r.id, x + w / 2, y + h / 2)
    })
  }

  drawCoordLabel(v) {                               // "(x, y)" next to the hovered vertex
    var ctx   = this.ctx
    var label = '(' + this.toCoord(v.x) + ', ' + this.toCoord(v.y) + ')'
    ctx.fillStyle    = '#ffff55'
    ctx.font         = 'bold 12px sans-serif'
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(label, v.x + this.RADIUS + 5, v.y - this.RADIUS + 5)
  }

  //______________________________ Mouse ______________________________
  mousePos(event) {                                 // mouse position inside the canvas
    var rect = this.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  handleClick(event) {
    if (this.contact) return
    var p = this.mousePos(event)
    if (this.mode === 'add')    this.handleAdd(p.x, p.y)
    if (this.mode === 'edge')   this.handleEdge(p.x, p.y)
    if (this.mode === 'delete') this.handleDelete(p.x, p.y)
  }

  handleAdd(x, y) {                                 // place a vertex on the nearest free grid point
    var sx = this.snap(x)
    var sy = this.snap(y)
    if (sx < this.ORIGIN || sy < this.ORIGIN) return    // clicked in the margin
    if (this.graph.isTaken(sx, sy)) return              // a vertex is already there
    this.graph.addVertex(sx, sy)
    this.draw()
  }

  handleEdge(x, y) {                                // pick two vertices to connect
    var v = this.graph.vertexAt(x, y, this.RADIUS)
    if (!v) return
    if (this.firstPickId === null) {
      this.firstPickId = v.id
    } else {
      if (this.firstPickId !== v.id) this.graph.addEdge(this.firstPickId, v.id)
      this.firstPickId = null
    }
    this.draw()
  }

  handleDelete(x, y) {                              // vertex first, then edge
    var v = this.graph.vertexAt(x, y, this.RADIUS)
    if (v) {
      this.graph.removeVertex(v.id)
    } else {
      var e = this.graph.edgeAt(x, y, 8)            // 8 pixels tolerance
      if (!e) return
      this.graph.removeEdge(e.id)
    }
    this.draw()
  }

  handleMouseMove(event) {
    if (this.contact) return
    var p = this.mousePos(event)
    var v = this.graph.vertexAt(p.x, p.y, this.RADIUS)
    this.setHovered(v ? v.id : null)
  }

  setHovered(id) {                                  // only redraw when the hover changes
    if (id === this.hoveredId) return
    this.hoveredId = id
    this.canvas.style.cursor = (id === null) ? 'default' : 'pointer'
    this.draw()
  }
}