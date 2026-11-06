// Graph 
//Code for the Graph class, which stores vertices and edges, plus undo/redo history.
// This is separate from the Editor class, which handles drawing and user interaction.


class Graph {
  constructor(name) {
    this.name      = name
    this.vertices  = []         // each vertex: { id, x, y }  (x, y in pixels, already snapped to the grid)
    this.edges     = []         // each edge:   { id, from, to }
    this.nextId    = 0          // next vertex id
    this.nextEid   = 0          // next edge id
    this.undoStack = []
    this.redoStack = []
  }

  // Lookups 
  getVertex(id) {                                   // vertex with this id, or undefined
    return this.vertices.find(function(v) { return v.id === id })
  }

  isTaken(x, y) {                                   // is there already a vertex at this spot?
    return this.vertices.some(function(v) { return v.x === x && v.y === y })
  }

  vertexAt(x, y, radius) {                          // vertex under the point, or null
    for (var i = this.vertices.length - 1; i >= 0; i--) {
      var v = this.vertices[i]
      if (this.distance(x, y, v.x, v.y) <= radius) return v
    }
    return null
  }

  edgeAt(x, y, tolerance) {                         // edge under the point, or null
    for (var i = 0; i < this.edges.length; i++) {
      var e    = this.edges[i]
      var from = this.getVertex(e.from)
      var to   = this.getVertex(e.to)
      if (!from || !to) continue
      if (this.distToSegment(x, y, from.x, from.y, to.x, to.y) < tolerance) return e
    }
    return null
  }

  // Geometry 
  distance(ax, ay, bx, by) {                        // straight-line distance between A and B
    var dx = bx - ax
    var dy = by - ay
    return Math.sqrt(dx*dx + dy*dy)
  }

  distToSegment(px, py, ax, ay, bx, by) {           // distance from point P to segment AB
    var dx = bx - ax
    var dy = by - ay                                // vector from A to B
    var lenSq = dx*dx + dy*dy                       // squared length of segment AB
    if (lenSq === 0) return this.distance(px, py, ax, ay)                  // A and B are the same point
    var t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / lenSq))    // projection factor t, clamped to [0,1]
    return this.distance(px, py, ax + t*dx, ay + t*dy)                     // distance to the closest point on AB
  }

  // Editing (each one saves history first)
  addVertex(x, y) {
    this.saveHistory()
    this.vertices.push({ id: this.nextId++, x: x, y: y })
  }

  addEdge(fromId, toId) {
    this.saveHistory()
    this.edges.push({ id: this.nextEid++, from: fromId, to: toId })
  }

  removeVertex(id) {                                // also removes any edges touching it
    this.saveHistory()
    this.vertices = this.vertices.filter(function(v) { return v.id !== id })
    this.edges    = this.edges.filter(function(e) { return e.from !== id && e.to !== id })
  }

  removeEdge(id) {
    this.saveHistory()
    this.edges = this.edges.filter(function(e) { return e.id !== id })
  }

  clear() {
    this.saveHistory()
    this.vertices = []
    this.edges    = []
    this.nextId   = 0
    this.nextEid  = 0
  }

  // History 
  snapshot() {                                      // deep copy of the current state
    return JSON.parse(JSON.stringify({
      vertices: this.vertices, edges: this.edges,
      nextId: this.nextId, nextEid: this.nextEid
    }))
  }

  restore(state) {                                  // put a snapshot back
    this.vertices = state.vertices
    this.edges    = state.edges
    this.nextId   = state.nextId
    this.nextEid  = state.nextEid
  }

  saveHistory() {                                   // call before every change
    this.undoStack.push(this.snapshot())
    this.redoStack = []                             // a new change clears redo
  }

  undo() {                                          // returns true if something was undone
    if (this.undoStack.length === 0) return false
    this.redoStack.push(this.snapshot())
    this.restore(this.undoStack.pop())
    return true
  }

  redo() {                                          // returns true if something was redone
    if (this.redoStack.length === 0) return false
    this.undoStack.push(this.snapshot())
    this.restore(this.redoStack.pop())
    return true
  }

  // Save / Load
  toData() {                                        // what gets written to graph.json
    return { vertices: this.vertices, edges: this.edges }
  }

  // Infer each vertex's clockwise neighbor order from the current drawing.
  // This is only an embedding candidate: it does not detect crossings or prove planarity.
  
  toRotationSystem() {
    var verticesById = new Map() // vertex id -> vertex object
    var neighborsById = new Map()
    var occupiedPositions = new Set()
    this.vertices.forEach(function(v) {
      if (v.id === null || v.id === undefined || verticesById.has(v.id)) {
        throw new Error('Cannot export a graph with missing or duplicate vertex IDs')
      }
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) {
        throw new Error('Cannot derive neighbor order without finite vertex coordinates')
      }
      var position = v.x + ',' + v.y
      if (occupiedPositions.has(position)) {
        throw new Error('Cannot derive a planar embedding when vertices share coordinates')
      }
      occupiedPositions.add(position)
      verticesById.set(v.id, v)
      neighborsById.set(v.id, new Set())
    })

    this.edges.forEach(function(e) {
      if (!verticesById.has(e.from) || !verticesById.has(e.to)) {
        throw new Error('Cannot export an edge that references a missing vertex')
      }
      if (e.from === e.to) {
        throw new Error('Cannot export a planar embedding with a self-loop')
      }
      if (neighborsById.get(e.from).has(e.to)) {
        throw new Error('Cannot export a planar embedding with duplicate edges')
      }
      neighborsById.get(e.from).add(e.to)
      neighborsById.get(e.to).add(e.from)
    })

    // Sort each vertex's neighbors in clockwise order around the vertex.
    return this.vertices.map(function(v) {
      var neighbors = Array.from(neighborsById.get(v.id))
      neighbors.sort(function(a, b) {
        var va = verticesById.get(a)
        var vb = verticesById.get(b)
        return Math.atan2(va.y - v.y, va.x - v.x) -
          Math.atan2(vb.y - v.y, vb.x - v.x)
      })

    
      for (var i = 0; neighbors.length > 1 && i < neighbors.length; i++) {
        var a = verticesById.get(neighbors[i])
        var b = verticesById.get(neighbors[(i + 1) % neighbors.length])
        var ax = a.x - v.x
        var ay = a.y - v.y
        var bx = b.x - v.x
        var by = b.y - v.y

        // Check for collinear edges that point in the same direction (which would make the neighbor order ambiguous).
        if (ax * by - ay * bx === 0 && ax * bx + ay * by > 0) {
          throw new Error('Cannot derive a unique circular neighbor order for collinear edges')
        }
      }
      return { vertex: v, neighbors: neighbors }
    })
  }

  // Export the planar-graph input format.
  // (REL.js checks planarity with Euler's formula when the XML is processed).
  // options.poles = { north, east, south, west } vertex ids marks the outer face;
  // without it the outer face is left "not-selected" and REL.js detects it.
  toXML(options) {
    var poles = options && options.poles
    var rotationSystem = this.toRotationSystem()
    var escapeAttribute = function(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
    }
    var lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<planarGraph schemaVersion="1" name="' + escapeAttribute(this.name) + '">',
      '  <vertices coordinateSystem="canvas-pixels">'
    ]

    rotationSystem.forEach(function(entry) {
      var vertex = entry.vertex
      lines.push('    <vertex id="' + escapeAttribute(vertex.id) +
        '" x="' + escapeAttribute(vertex.x) +
        '" y="' + escapeAttribute(vertex.y) + '" />')
    })
    lines.push('  </vertices>')
    lines.push('  <edges directed="false">')
    this.edges.forEach(function(edge) {
      var idAttribute = edge.id === null || edge.id === undefined
        ? ''
        : ' id="' + escapeAttribute(edge.id) + '"'
      lines.push('    <edge' + idAttribute +
        ' from="' + escapeAttribute(edge.from) +
        '" to="' + escapeAttribute(edge.to) + '" />')
    })
    lines.push('  </edges>')
    lines.push('  <rotationSystem status="candidate" source="canvas-coordinates" direction="clockwise">')
    rotationSystem.forEach(function(entry) {
      lines.push('    <rotation vertex="' + escapeAttribute(entry.vertex.id) + '">')
      entry.neighbors.forEach(function(neighborId) {
        lines.push('      <neighbor ref="' + escapeAttribute(neighborId) + '" />')
      })
      lines.push('    </rotation>')
    })
    lines.push('  </rotationSystem>')
    if (poles) {
      lines.push('  <outerFace status="selected">')
      ;['north', 'east', 'south', 'west'].forEach(function(side) {
        if (!this.getVertex(poles[side])) {
          throw new Error('Pole ' + side + ' refers to a vertex that does not exist')
        }
        lines.push('    <pole side="' + side + '" ref="' + escapeAttribute(poles[side]) + '" />')
      }, this)
      lines.push('  </outerFace>')
    } else {
      lines.push('  <outerFace status="not-selected" />')
    }
    lines.push('  <contactRepresentation status="not-generated" />')
    lines.push('</planarGraph>')
    return lines.join('\n')
  }

  loadData(data) {                                  // replace contents with data from a file
    this.vertices = data.vertices || []
    this.edges    = data.edges    || []
    this.nextId   = this.vertices.reduce(function(m, v) { return Math.max(m, v.id) }, -1) + 1
    this.nextEid  = this.edges.reduce(function(m, e) { return Math.max(m, e.id) }, -1) + 1
  }
}

// Usable from the Node tests as well as from a <script> tag.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Graph
}