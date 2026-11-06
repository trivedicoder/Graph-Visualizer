class v1 {

  // Makes a list of neighbours for each vertex using the edges.
  static buildNeighbours(graph) {
    var nb = new Map()
    graph.edges.forEach(function(e) {
      if (!nb.has(e.from)) nb.set(e.from, [])
      if (!nb.has(e.to))   nb.set(e.to, [])
      nb.get(e.from).push(e.to)
      nb.get(e.to).push(e.from)
    })
    return nb
  }

  // Picks the two ends of the st-ordering. Returns { s, t } or { error } if it can't be done.
  static pickEnds(graph) {
    if (graph.vertices.length < 2) return { error: 'Graph must have at least two vertices.' }
    var sorted = graph.vertices.slice().sort((a, b) => a.y - b.y)
    return { s: sorted[sorted.length - 1].id, t: sorted[0].id }   // lowest = s, highest = t
  }

  // Computes the st-ordering. Returns { order } or { error } if it can't be done.
  static compute(graph, s, t) {
    var nb = this.buildNeighbours(graph)
    var placed = new Set([s, t])   // vertices already in the line
    var order  = [s, t]            // the line of vertices

    while (placed.size < graph.vertices.length) {
      var ear = this.findEar(nb, placed)
      if (ear.error) return ear

      var path   = ear.path
      var a      = path[0]                  // where the ear starts 
      var b      = path[path.length - 1]    // where the ear ends
      var middle = path.slice(1, -1)        // only the new vertices

      var ia = order.indexOf(a)
      var ib = order.indexOf(b)

      // If the ear goes backwards in the line, reverse it so it goes forwards.
      if (ia > ib) middle.reverse()
      if (ib < ia) middle.reverse()

      // put the new vertices right after whichever end comes first
      order.splice(Math.min(ia, ib) + 1, 0, ...middle)
      middle.forEach(function(v) { placed.add(v) })
    }
    return { order }
  }

  // Finds an ear in the graph. An ear is a path that starts and ends at vertices already in the line,
  // but goes through vertices that aren't in the line. Gives back { path } or { error } if it can't find one.
  static findEar(nb, placed) {
    for (var a of placed) {
      for (var u of nb.get(a) || []) {   // || [] in case a has no edges
        if (placed.has(u)) continue   // u has to be outside the line
        var visited = new Set()
        var path = this.dfsEar(nb, placed, a, u, visited)
        if (path) return { path: [a, ...path] }   // add the starting vertex to the front
      }
    }
    return { error: 'Could not find an ear. The graph may not be biconnected.' }
  }

  // Does a depth-first search to find the other end of an ear. Returns the path from u to the other end, or null if it can't find one.
  static dfsEar(nb, placed, a, u, visited) {
    visited.add(u)
    for (var v of nb.get(u)) {
      if (v === a) continue   // don't go back to the starting vertex
      if (placed.has(v)) return [u, v]   // found the other end of the ear
      if (!visited.has(v)) {
        var path = this.dfsEar(nb, placed, a, v, visited)
        if (path) return [u, ...path]   // add u to the front of the path
      }
    }
    return null   // no ear found from this vertex
  }

  // Checks if the given order is a valid st-ordering for the graph. Returns true or false.
  static isValid(graph, order, s, t) {
    if (order[0] !== s) return false
    if (order[order.length - 1] !== t) return false

    var pos = new Map(order.map((v, i) => [v, i]))   // where each vertex is in the line
    var nb = this.buildNeighbours(graph)
    for (var i = 1; i < order.length - 1; i++) {
      var neighbours = nb.get(order[i]) || []
      var hasEarlier = neighbours.some(n => pos.get(n) < i)
      var hasLater   = neighbours.some(n => pos.get(n) > i)
      if (!hasEarlier || !hasLater) return false
    }
    return true
  }

  // Applies the st-ordering to the graph by changing the y-coordinates of the vertices. The order is from bottom to top.
  static apply(editor, order) {
    editor.graph.saveHistory()   // save first so undo works
    var height = editor.canvas.height
    var spacing = height / (order.length + 1)
    for (var i = 0; i < order.length; i++) {
      var v = editor.graph.getVertex(order[i])
      if (v) v.y = height - (i + 1) * spacing   // bottom to top
    }
    editor.draw()
  }

  // Runs the whole st-ordering process: pick ends, compute order, validate, and apply. Returns true if successful, false if not.
  static run(editor) {
    var graph = editor.graph
    var ends = this.pickEnds(graph)
    if (ends.error) { alert(ends.error); return false }
    var result = this.compute(graph, ends.s, ends.t)
    if (result.error) { alert(result.error); return false }
    if (!this.isValid(graph, result.order, ends.s, ends.t)) {
      alert('The computed order is not valid.')
      return false
    }
    this.apply(editor, result.order)
    return true
  }
}

// Lets Node load this file for testing (ignored in the browser)
if (typeof module !== 'undefined') module.exports = v1