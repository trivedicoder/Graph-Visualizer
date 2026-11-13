// Tests for faces.js.  Run with:  node faces.test.js
var Faces = require('./Faces.js')

// Small stand-in for the Graph class (only what Faces needs).
// Points are given in grid coordinates and turned into pixels like the editor does.
function makeGraph(points, edges) {
  var g = {
    name: 'Test',
    vertices: points.map(function(p, i) { return { id: i, x: 50 + 50 * p[0], y: 50 + 50 * p[1] } }),
    edges:    edges.map(function(e, i)  { return { id: i, from: e[0], to: e[1] } }),
    getVertex: function(id) { return this.vertices.find(function(v) { return v.id === id }) }
  }
  return g
}

var passed = 0, failed = 0
function check(name, ok) {
  if (ok) { passed++; console.log('  ok    ' + name) }
  else    { failed++; console.log('  FAIL  ' + name) }
}

// Every dart is used once, exactly one outer face per piece, Euler holds.
function sound(g, r) {
  var darts = 0
  r.faces.forEach(function(f) { darts += f.vertices.length })
  var edges = 0
  r.rot.forEach(function(l) { edges += l.length })
  var outer = r.faces.filter(function(f) { return f.outer }).length
  return darts === edges && outer === Faces.countPieces(r.rot) && Faces.eulerCheck(g, r)
}

console.log('Fixed graphs')

// Square:  (0,0) (1,0) (1,1) (0,1)
var sq = makeGraph([[0,0],[1,0],[1,1],[0,1]], [[0,1],[1,2],[2,3],[3,0]])
var r = Faces.compute(sq)
check('square has 2 faces',            r.faces.length === 2)
check('square has 1 inner, 1 outer',   r.faces.filter(f => f.outer).length === 1)
check('square is sound',               sound(sq, r))

// Square with a diagonal -> 3 faces
var diag = makeGraph([[0,0],[1,0],[1,1],[0,1]], [[0,1],[1,2],[2,3],[3,0],[0,2]])
r = Faces.compute(diag)
check('square + diagonal has 3 faces', r.faces.length === 3 && sound(diag, r))

// 3x3 grid of vertices -> 4 squares + outer = 5 faces
var pts = [], ed = []
for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) pts.push([x, y])
for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) {
  var id = y * 3 + x
  if (x < 2) ed.push([id, id + 1])
  if (y < 2) ed.push([id, id + 3])
}
var grid = makeGraph(pts, ed)
r = Faces.compute(grid)
check('3x3 grid has 5 faces',          r.faces.length === 5 && sound(grid, r))
check('3x3 inner faces have 4 vertices', r.faces.filter(f => !f.outer).every(f => f.vertices.length === 4))
check('3x3 outer face has 8 vertices',   r.faces.find(f => f.outer).vertices.length === 8)

// A path (tree) -> 1 face that walks both sides of every edge
var path = makeGraph([[0,0],[1,0],[2,0],[2,1]], [[0,1],[1,2],[2,3]])
r = Faces.compute(path)
check('tree has 1 face of size 6',     r.faces.length === 1 && r.faces[0].vertices.length === 6 && sound(path, r))

// Square with a dangling edge inside it
var hang = makeGraph([[0,0],[2,0],[2,2],[0,2],[1,1]], [[0,1],[1,2],[2,3],[3,0],[0,4]])
r = Faces.compute(hang)
check('square + inside spike: 2 faces', r.faces.length === 2 && sound(hang, r))

// Two separate squares -> 2 inner + 2 outer
var two = makeGraph([[0,0],[1,0],[1,1],[0,1],[3,0],[4,0],[4,1],[3,1]],
                    [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]])
r = Faces.compute(two)
check('two squares: 4 faces',          r.faces.length === 4 && sound(two, r))

// Duplicate edge is ignored
var dup = makeGraph([[0,0],[1,0],[1,1],[0,1]], [[0,1],[1,0],[1,2],[2,3],[3,0]])
r = Faces.compute(dup)
check('duplicate edge ignored',        r.faces.length === 2 && sound(dup, r))

// Isolated vertex is fine
var iso = makeGraph([[0,0],[1,0],[1,1],[0,1],[5,5]], [[0,1],[1,2],[2,3],[3,0]])
r = Faces.compute(iso)
check('isolated vertex ignored',       r.faces.length === 2 && sound(iso, r))

// Both diagonals cross -> error
var cross = makeGraph([[0,0],[1,0],[1,1],[0,1]], [[0,1],[1,2],[2,3],[3,0],[0,2],[1,3]])
check('crossing edges give an error',  !!Faces.compute(cross).error)

// Edge running straight through another vertex -> error
var through = makeGraph([[0,0],[2,0],[1,0],[1,1]], [[0,1],[2,3]])
check('edge through a vertex gives an error', !!Faces.compute(through).error)

console.log('\nRandom grid graphs (30 trials)')
// Random subsets of grid edges are always planar, so every trial should be sound.
for (var t = 0; t < 30; t++) {
  var n = 3 + Math.floor(Math.random() * 6)       // 3x3 up to 8x8
  var P = [], E = []
  for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) P.push([x, y])
  for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
    var id = y * n + x
    if (x < n - 1 && Math.random() < 0.7) E.push([id, id + 1])
    if (y < n - 1 && Math.random() < 0.7) E.push([id, id + n])
    if (x < n - 1 && y < n - 1 && Math.random() < 0.2) {          // some diagonals, never both in one cell
      if (Math.random() < 0.5) E.push([id, id + n + 1]); else E.push([id + 1, id + n])
    }
  }
  var g = makeGraph(P, E)
  var res = Faces.compute(g)
  check('trial ' + (t + 1) + ' (' + n + 'x' + n + ', ' + E.length + ' edges, ' + (res.faces ? res.faces.length : '?') + ' faces)',
        !res.error && sound(g, res))
}

console.log('\nXML for the square with a diagonal:\n')
var fakeEditor = { GRID: 50, toCoord: function(p) { return Math.round((p - 50) / 50) } }
console.log(Faces.toXML(diag, fakeEditor).xml)

var planarXml = `<?xml version="1.0" encoding="UTF-8"?>
<planarGraph schemaVersion="1" name="XML square with diagonal">
  <vertices>
    <vertex id="0" x="0" y="0" />
    <vertex id="1" x="1" y="0" />
    <vertex id="2" x="1" y="1" />
    <vertex id="3" x="0" y="1" />
  </vertices>
  <edges>
    <edge id="0" from="0" to="1" />
    <edge id="1" from="1" to="2" />
    <edge id="2" from="2" to="3" />
    <edge id="3" from="3" to="0" />
    <edge id="4" from="0" to="2" />
  </edges>
  <rotationSystem status="candidate" direction="clockwise">
    <rotation vertex="0"><neighbor ref="1" /><neighbor ref="2" /><neighbor ref="3" /></rotation>
    <rotation vertex="1"><neighbor ref="2" /><neighbor ref="0" /></rotation>
    <rotation vertex="2"><neighbor ref="3" /><neighbor ref="0" /><neighbor ref="1" /></rotation>
    <rotation vertex="3"><neighbor ref="0" /><neighbor ref="2" /></rotation>
  </rotationSystem>
</planarGraph>`
var xmlResult = Faces.computeFromXML(planarXml)
check('planar XML produces all 3 faces', !xmlResult.error && xmlResult.faces.length === 3 && sound(xmlResult.graph, xmlResult))

console.log('\n' + passed + ' passed, ' + failed + ' failed')