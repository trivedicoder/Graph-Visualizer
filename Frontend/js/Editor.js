//__________________________________________________________________________ Editor __________________________________________________________________________
// The canvas: the grid, drawing, and mouse clicks/hover/drag.
// Edits one Graph at a time (whichever tab is open).

class Editor {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx    = canvas.getContext('2d')

    this.RADIUS = 18            // vertex circle size
    this.GRID   = 50            // pixels between grid points
    this.ORIGIN = 50            // gap from the canvas edge to grid point (0,0)

    this.graph       = null     // the graph being edited (set by Buttons)
    this.mode        = 'add'    // 'add', 'edge', 'delete', or 'pick' (picking s and t)
    this.firstPickId = null     // first vertex picked in edge mode
    this.hoveredId   = null     // vertex under the mouse
    this.dragId      = null     // vertex being dragged (add mode)
    this.dragged     = false    // true once a drag has actually moved the vertex
    this.mouse       = null     // last mouse position, for the stretchy edge line
    this.ghost       = null     // grid point where a new vertex would go (add mode), or null

    this.onPick      = null     // in 'pick' mode, called with the clicked vertex (set by Buttons)
    this.markedS     = null     // vertex picked as s, while waiting for t
    this.stOrder     = null     // after an st-ordering: { order, pos } for the s/t colours and number tags

    // Arrow functions (=>) keep "this" pointing at the Editor inside the handler
    canvas.addEventListener('click',      (e) => this.handleClick(e))
    canvas.addEventListener('mousedown',  (e) => this.handleMouseDown(e))
    canvas.addEventListener('mousemove',  (e) => this.handleMouseMove(e))
    canvas.addEventListener('mouseup',    ()  => this.handleMouseUp())
    canvas.addEventListener('mouseleave', ()  => this.handleMouseLeave())
  }

  setGraph(graph) {                                 // show a different graph (used by tabs)
    this.graph       = graph
    this.firstPickId = null
    this.hoveredId   = null
    this.markedS     = null
    this.stOrder     = null
    this.draw()
  }

  setMode(mode) {
    this.mode        = mode
    this.firstPickId = null
    this.markedS     = null
    this.draw()
  }

  //______________________________ St-ordering colours ______________________________
  get S_COLOUR() { return '#55ff55' }               // green for s
  get T_COLOUR() { return '#cc77ff' }               // purple for t

  showStOrder(order) {                              // remember the order so draw() can colour s and t
    this.stOrder = { order: order, pos: new Map(order.map((id, i) => [id, i])) }
    this.draw()
  }

  clearStOrder() {                                  // the graph changed, so the order is out of date
    this.stOrder = null
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
    var hv = this.graph.getVertex(this.hoveredId)   // hovered vertex, if any
    this.drawBackground()
    this.drawGrid(hv)
    this.drawEdges()
    this.drawPreviewEdge()                          // stretchy line in edge mode (under the vertices)
    this.drawGhost()                                // see-through vertex where a click would place one
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

  drawPreviewEdge() {                               // line from the first picked vertex to the mouse
    if (this.mode !== 'edge' || this.firstPickId === null || !this.mouse) return
    var from = this.graph.getVertex(this.firstPickId)
    if (!from) return
    var ctx = this.ctx
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(this.mouse.x, this.mouse.y)
    ctx.strokeStyle = '#ff5555'
    ctx.lineWidth   = 2
    ctx.setLineDash([6, 6])                         // dashed = not a real edge yet
    ctx.stroke()
    ctx.setLineDash([])                             // back to solid for everything else
  }

  drawGhost() {                                     // faded, dashed vertex at the grid point under the mouse
    var g = this.ghost
    if (this.mode !== 'add' || !g || this.dragId !== null) return
    if (this.graph.isTaken(g.x, g.y)) return        // just placed one there
    var ctx = this.ctx
    ctx.beginPath()
    ctx.arc(g.x, g.y, this.RADIUS, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(85, 170, 255, 0.25)'      // same blue as a vertex, but see-through
    ctx.fill()
    ctx.strokeStyle = '#55aaff'
    ctx.lineWidth   = 2
    ctx.setLineDash([4, 4])                         // dashed = not placed yet
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle    = 'rgba(255, 255, 85, 0.6)'    // faded "(x, y)" so you can see where it'll land
    ctx.font         = 'bold 12px sans-serif'
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('(' + this.toCoord(g.x) + ', ' + this.toCoord(g.y) + ')', g.x + this.RADIUS + 5, g.y - this.RADIUS + 5)
  }

  drawVertices() {
    var ctx = this.ctx
    this.graph.vertices.forEach((v) => {
      ctx.beginPath()
      ctx.arc(v.x, v.y, this.RADIUS, 0, 2 * Math.PI)
      ctx.fillStyle = this.vertexColour(v)
      ctx.fill()
      ctx.fillStyle    = '#000'
      ctx.font         = 'bold 12px sans-serif'
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(v.id, v.x, v.y)

      var tag = this.stTag(v)                       // "s (1)", "4", "t (9)" to the left of the vertex
      if (tag) {
        var right = v.x - this.RADIUS - 4
        var w     = ctx.measureText(tag).width
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'       // dark box so the tag is readable over edges
        ctx.fillRect(right - w - 3, v.y - 8, w + 6, 16)
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'right'
        ctx.fillText(tag, right, v.y)
      }
    })
  }

  vertexColour(v) {
    if (this.stOrder) {                             // only s and t get a colour
      var order = this.stOrder.order
      if (v.id === order[0])                return this.S_COLOUR
      if (v.id === order[order.length - 1]) return this.T_COLOUR
    }
    if (v.id === this.markedS)     return this.S_COLOUR   // picked as s, waiting for t
    if (v.id === this.firstPickId) return '#55ffff'       // brighter if picked for an edge
    return '#55aaff'
  }

  stTag(v) {                                        // label showing where the vertex is in the order
    if (v.id === this.markedS) return 's'
    if (!this.stOrder) return null
    var k = this.stOrder.pos.get(v.id)
    var n = this.stOrder.order.length
    if (k === undefined) return null
    if (k === 0)     return 's (1)'
    if (k === n - 1) return 't (' + n + ')'
    return String(k + 1)
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
    if (this.dragged) {                             // a drag just ended, so this isn't a real click
      this.dragged = false
      return
    }
    var p = this.mousePos(event)
    if (this.mode === 'add')    this.handleAdd(p.x, p.y)
    if (this.mode === 'edge')   this.handleEdge(p.x, p.y)
    if (this.mode === 'delete') this.handleDelete(p.x, p.y)
    if (this.mode === 'pick')   this.handlePick(p.x, p.y)
  }

  handleAdd(x, y) {                                 // place a vertex on the nearest free grid point
    var sx = this.snap(x)
    var sy = this.snap(y)
    if (sx < this.ORIGIN || sy < this.ORIGIN) return    // clicked in the margin
    if (this.graph.isTaken(sx, sy)) return              // a vertex is already there
    this.graph.addVertex(sx, sy)
    this.clearStOrder()
    this.draw()
  }

  handleEdge(x, y) {                                // pick two vertices to connect
    var v = this.graph.vertexAt(x, y, this.RADIUS)
    if (!v) {                                       // clicked empty space: cancel the line
      this.firstPickId = null
      this.draw()
      return
    }
    if (this.firstPickId === null) {
      this.firstPickId = v.id
    } else {
      if (this.firstPickId !== v.id) {
        this.graph.addEdge(this.firstPickId, v.id)
        this.clearStOrder()
      }
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
    this.clearStOrder()
    this.draw()
  }

  handlePick(x, y) {                                // picking s and t: Buttons decides what to do
    var v = this.graph.vertexAt(x, y, this.RADIUS)
    if (v && this.onPick) this.onPick(v)
  }

  handleMouseDown(event) {                          // start dragging a vertex (add mode only)
    if (this.mode !== 'add') return
    var p = this.mousePos(event)
    var v = this.graph.vertexAt(p.x, p.y, this.RADIUS)
    if (v) {
      this.dragId  = v.id
      this.dragged = false
    }
  }

  handleMouseMove(event) {
    var p = this.mousePos(event)
    this.mouse = p
    if (this.dragId !== null) {                     // dragging: move the vertex, nothing else
      this.dragTo(p.x, p.y)
      return
    }
    var v = this.graph.vertexAt(p.x, p.y, this.RADIUS)
    this.setHovered(v ? v.id : null)
    this.updateGhost(p, v)
    if (this.firstPickId !== null) this.draw()      // stretch the edge line to the mouse
  }

  updateGhost(p, overVertex) {                      // move the see-through vertex (redraw only if it moved)
    var g = null
    if (this.mode === 'add' && !overVertex) {
      var sx = this.snap(p.x)
      var sy = this.snap(p.y)
      if (sx >= this.ORIGIN && sy >= this.ORIGIN && !this.graph.isTaken(sx, sy)) g = { x: sx, y: sy }
    }
    var same = (g === null && this.ghost === null) ||
               (g && this.ghost && g.x === this.ghost.x && g.y === this.ghost.y)
    this.ghost = g
    if (!same) this.draw()
  }

  dragTo(x, y) {                                    // move the dragged vertex to the nearest free grid point
    var v  = this.graph.getVertex(this.dragId)
    var sx = this.snap(x)
    var sy = this.snap(y)
    if (!v || (sx === v.x && sy === v.y)) return        // still on the same grid point
    if (sx < this.ORIGIN || sy < this.ORIGIN) return    // don't go into the margin
    if (this.graph.isTaken(sx, sy)) return              // another vertex is there
    if (!this.dragged) this.graph.saveHistory()         // one undo step per drag
    this.dragged = true
    v.x = sx
    v.y = sy
    this.draw()
  }

  handleMouseUp() {                                 // stop dragging (the click event comes right after)
    this.dragId = null
  }

  handleMouseLeave() {                              // mouse left the canvas: stop everything
    this.dragId  = null
    this.dragged = false                            // no click will follow, so reset now
    this.mouse   = null
    this.ghost   = null
    this.setHovered(null)
    this.draw()                                     // removes the stretchy line and the ghost
  }

  setHovered(id) {                                  // only redraw when the hover changes
    if (id === this.hoveredId) return
    this.hoveredId = id
    this.canvas.style.cursor = (id === null) ? 'default' : 'pointer'
    this.draw()
  }
}