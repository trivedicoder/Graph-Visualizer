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
    var e = graph.edges.find(e => e.from !== e.to)   // skip self-loops
    if (!e) return { error: 'Graph needs at least one edge between two different vertices.' }
    return { s: e.from, t: e.to }
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
      for (var u of nb.get(a) || []) {
        if (placed.has(u)) continue
        var visited = new Set()
        var path = this.dfsEar(nb, placed, a, u, visited)
        if (path) return { path: [a, ...path] }
      }
    }
    return { error: 'No ear found. The graph may not be biconnected.' }
  }

  // Does a depth-first search to find the other end of an ear. Returns the path from u to the other end, or null if it can't find one.
  static dfsEar(nb, placed, a, u, visited) {
    visited.add(a)                   // never walk back to the start of the ear
    if (placed.has(u)) return [u]    // found the other end of the ear
    visited.add(u)
    for (var v of nb.get(u) || []) {
      if (visited.has(v)) continue
      var path = this.dfsEar(nb, placed, a, v, visited)
      if (path) return [u, ...path]  // add u to the front of the path
    }
    return null
  }

  // Checks if the given order is a valid st-ordering for the graph. Returns true or false.
static isValid(graph, order, s, t) {
    if (order[0] !== s || order[order.length - 1] !== t) return false
    // every vertex must appear exactly once
    if (order.length !== graph.vertices.length) return false
    var pos = new Map(order.map((v, idx) => [v, idx]))
    if (pos.size !== order.length) return false                         // duplicates
    if (!graph.vertices.every(v => pos.has(v.id))) return false         // unknown or missing ids

    for (var i = 1; i < order.length - 1; i++) {
      var v = order[i]
      var neighbours = graph.edges
        .filter(e => e.from === v || e.to === v)
        .map(e => e.from === v ? e.to : e.from)
      var hasEarlier = neighbours.some(w => pos.get(w) < i)
      var hasLater   = neighbours.some(w => pos.get(w) > i)
      if (!hasEarlier || !hasLater) return false
    }
    return true
  }

   // Applies the st-ordering by changing the y-coordinates. s goes at the bottom, t at the top.
  static apply(editor, order) {
    editor.graph.saveHistory()                          // so undo works
    var spacing = editor.GRID * 2                       // 100px, stays on grid points
    var bottom  = editor.ORIGIN + (order.length - 1) * spacing
    order.forEach((id, i) => {
      var v = editor.graph.getVertex(id)
      if (v) v.y = bottom - i * spacing                 // i = 0 (s) lowest, last (t) at the top row
    })
    editor.draw()
  }

  // Runs the whole st-ordering process: pick ends, compute order, validate, and apply. Returns true if successful, false if not.
  static run(editor) {
    var ends = this.pickEnds(editor.graph)
    if (ends.error) {
      console.error(ends.error)
      return false
    }
    var result = this.compute(editor.graph, ends.s, ends.t)
    if (result.error) {
      console.error(result.error)
      return false
    }
    if (!this.isValid(editor.graph, result.order, ends.s, ends.t)) {
      console.error('Computed order is not valid.')
      return false
    }
    this.apply(editor, result.order)
    return true
  }
}

// Lets Node load this file for testing (ignored in the browser)
if (typeof module !== 'undefined') module.exports = v1