
const test = require('node:test'); 
const assert = require('node:assert/strict');
const { createContactRepresentation, createContactRepresentationFromXML } = require('./Contact rep.js');
const { parsePlanarGraphXML } = require('./PlanarXML.js');
const PlanarREL = require('./REL.js');
const Graph = require('../../Frontend/js/Graph.js');

const poles = { N: 'N', E: 'E', S: 'S', W: 'W' };
const contactPoles = { north: poles.N, east: poles.E, south: poles.S, west: poles.W };
const outer = [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']].map(([from, to], i) => ({ id: `o${i}`, from, to }));
const edge = (id, from, to) => ({ id, from, to });
const TRIALS = Number(process.env.FUZZ_TRIALS || 120);

// Contact Rep builds its adjacency list from edges; no st-order is supplied.
function createRepresentation(graph) {
  return createContactRepresentation(graph, { poles: contactPoles });
}

// Same circular order, possibly starting at a different neighbor.
function assertSameCircularOrder(actual, expected) {
  assert.equal(actual.length, expected.length, `${actual} vs ${expected}`);
  const start = actual.indexOf(expected[0]);
  assert.ok(start >= 0, `${actual} vs ${expected}`);
  assert.deepEqual(actual.slice(start).concat(actual.slice(0, start)), expected);
}

// Count the number of edges in a graph.
function graphEdgeCount(graph) {
  return graph.edges.length;
}

// Return a map of edges to their colors, for testing the REL.
function colorsOf(result) {
  const colors = {};
  for (const e of result.rel.edges) if (e.color) colors[`${e.from}->${e.to}`] = e.color;
  return colors;
}

// Screen coordinates (y grows down), like the editor: N is on top.
function makeWheelGraph() {
  return {
    vertices: [
      { id: 'N', x: 0, y: -100 },
      { id: 'E', x: 100, y: 0 },
      { id: 'S', x: 0, y: 100 },
      { id: 'W', x: -100, y: 0 },
      { id: 'C', x: 0, y: 0 }
    ],
    // The outer edges are in clockwise order, so the embedding is clockwise.
    edges: [
      ...outer,
      edge('c1', 'C', 'N'),
      edge('c2', 'C', 'E'),
      edge('c3', 'C', 'S'),
      edge('c4', 'C', 'W')
    ]
  };
}

// Two inner vertices, each connected to all four outer vertices and to each other. The embedding is clockwise.
function makeTwoInnerVertexGraph() {
  return {
    vertices: [
      { id: 'N', x: 0, y: -100 },
      { id: 'E', x: 100, y: 0 },
      { id: 'S', x: 0, y: 100 },
      { id: 'W', x: -100, y: 0 },
      { id: 'a', x: -40, y: 0 },
      { id: 'b', x: 40, y: 0 }
    ],

    // The outer edges are in clockwise order, so the embedding is clockwise. The inner edge a-b is also clockwise with respect to the outer face.
    edges: [
      ...outer,
      edge('a1', 'a', 'W'),
      edge('a2', 'a', 'N'),
      edge('a3', 'a', 'S'),
      edge('ab', 'a', 'b'),
      edge('b1', 'b', 'N'),
      edge('b2', 'b', 'S'),
      edge('b3', 'b', 'E')
    ]
  };
}

// ---------- adjacency + circular orders ----------
// The adjacency list is built from the edges, and the circular order is derived from the coordinates (or from the XML if present). The traversal order is a depth-first search starting from the north pole.
test('wheel graph builds adjacency and traverses without a supplied st-order', () => {
  const graph = makeWheelGraph();
  const result = createRepresentation(graph);

  assert.equal(result.valid, true, result.problems.join('; '));
  assert.equal(result.rotationSource, 'coordinates');
  // Polar ordering, clockwise on screen.
  assertSameCircularOrder(result.adjacency.get('C'), ['N', 'E', 'S', 'W']);
  assert.equal(result.traversalOrder.length, graph.vertices.length);
  assert.ok(result.traversalOrder.includes('N'));
  assert.ok(result.traversalOrder.includes('C'));
  assert.ok(result.rectangles.C);
  assert.equal(result.layoutValid, true, result.layoutProblems.join('; '));
});

// Two inner vertices, each connected to all four outer vertices and to each other. The embedding is clockwise.
test('two inner vertices are connected through the edge-derived adjacency list', () => {
  const graph = makeTwoInnerVertexGraph();
  const result = createRepresentation(graph);

  // The adjacency list is built from the edges, and the circular order is derived from the coordinates (or from the XML if present).
  // The traversal order is a depth-first search starting from the north pole.
  assert.equal(result.valid, true, result.problems.join('; '));
  assertSameCircularOrder(result.adjacency.get('a'), ['N', 'b', 'S', 'W']);
  assert.equal(result.traversalOrder.length, graph.vertices.length);
  assert.ok(result.traversalOrder.includes('a'));
  assert.ok(result.traversalOrder.includes('b'));
  assert.ok(result.rectangles.a);
  assert.ok(result.rectangles.b);
  assert.equal(result.layoutValid, true, result.layoutProblems.join('; '));
});

// The REL is derived from the embedding and the adjacency list. The canonical order is derived from the REL.
test('XML rotation system controls neighbor traversal order', () => {
  const graph = {
    vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }, { id: 'c', x: 0, y: 1 }],
    edges: [edge('ab', 'a', 'b'), edge('ac', 'a', 'c')],
    embedding: {
      rotationSystem: [
        { vertex: 'a', neighbors: ['c', 'b'] },
        { vertex: 'b', neighbors: ['a'] },
        { vertex: 'c', neighbors: ['a'] }
      ]
    }
  };
  const result = createContactRepresentation(graph);

  // The REL is derived from the embedding and the adjacency list. The canonical order is derived from the REL.
  assert.equal(result.valid, true, result.problems.join('; '));
  assert.equal(result.rotationSource, 'xml');
  assert.deepEqual(result.adjacency.get('a'), ['c', 'b']);
  assert.deepEqual(result.traversalOrder, ['a', 'c', 'b']);
  assert.equal(result.relValid, false, 'a path is not a PTP graph');
});

// The REL is derived from the embedding and the adjacency list. The canonical order is derived from the REL.
test('rejects a rotation list that disagrees with the edges', () => {
  const graph = {
    vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }],
    edges: [edge('ab', 'a', 'b')],
    embedding: {
      rotationSystem: [
        { vertex: 'a', neighbors: [] },
        { vertex: 'b', neighbors: ['a'] }
      ]
    }
  };

  // The REL is derived from the embedding and the adjacency list. The canonical order is derived from the REL.
  const result = createContactRepresentation(graph);
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.includes("Rotation for vertex 'a'")));
});
// Test that overlapping edges make the circular order undefined
test('overlapping edges make the circular order undefined', () => {
  const graph = {
    vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }, { id: 'c', x: 2, y: 0 }],
    edges: [edge('ab', 'a', 'b'), edge('ac', 'a', 'c')]
  };
  const result = createContactRepresentation(graph);
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.includes('overlap')));
});

// ---------- refined canonical order + REL ----------

test('wheel graph: canonical order and REL', () => {
  const result = createRepresentation(makeWheelGraph());
  assert.equal(result.relValid, true, result.relProblems.join('; '));
  assert.deepEqual(result.canonicalOrder, ['S', 'W', 'C', 'E', 'N']);
  assert.deepEqual(colorsOf(result), {
    'W->C': 'red', 'C->E': 'red',     // west to east
    'S->C': 'blue', 'C->N': 'blue'    // south to north
  });
});


test('two inner vertices: canonical order and REL', () => {
  const result = createRepresentation(makeTwoInnerVertexGraph());
  assert.equal(result.relValid, true, result.relProblems.join('; '));
  assert.deepEqual(result.canonicalOrder, ['S', 'W', 'a', 'b', 'E', 'N']);
  assert.deepEqual(colorsOf(result), {
    'W->a': 'red', 'a->b': 'red', 'b->E': 'red',
    'S->a': 'blue', 'a->N': 'blue', 'S->b': 'blue', 'b->N': 'blue'
  });
});

// Test that the rectangular dual is a pinwheel frame around the two inner vertices
test('two inner vertices: rectangular dual is a pinwheel frame around a and b', () => {
  const result = createRepresentation(makeTwoInnerVertexGraph());
  assert.equal(result.layoutValid, true, result.layoutProblems.join('; '));
  assert.deepEqual(result.layoutSize, { width: 4, height: 3 });
  const r = result.rectangles;
  assert.deepEqual([r.N, r.E, r.S, r.W, r.a, r.b], [
    { id: 'N', x: 0, y: 0, width: 3, height: 1 },
    { id: 'E', x: 3, y: 0, width: 1, height: 2 },
    { id: 'S', x: 1, y: 2, width: 3, height: 1 },
    { id: 'W', x: 0, y: 1, width: 1, height: 2 },
    { id: 'a', x: 1, y: 1, width: 1, height: 1 },
    { id: 'b', x: 2, y: 1, width: 1, height: 1 }
  ]);
  assert.equal(result.contacts.length, graphEdgeCount(makeTwoInnerVertexGraph()));
});

// Test that if the edge a-b is missing, the REL is invalid and there are no rectangles
test('no REL means no rectangles, with the reason', () => {
  const quad = makeTwoInnerVertexGraph();
  quad.edges = quad.edges.filter((e) => e.id !== 'ab');
  const result = createRepresentation(quad);
  assert.deepEqual(result.rectangles, {});
  assert.equal(result.layoutValid, false);
  assert.ok(result.layoutProblems[0].includes('No rectangular dual'));
});

// Test that y-up coordinates give the same REL (orientation is normalized from the poles)
test('y-up coordinates give the same REL (orientation is normalized from the poles)', () => {
  const graph = makeTwoInnerVertexGraph();
  graph.vertices.forEach((v) => { v.y = -v.y; });
  const result = createRepresentation(graph);
  assert.equal(result.relValid, true, result.relProblems.join('; '));
  assert.equal(result.rel.flipped, true);
  assert.deepEqual(result.canonicalOrder, ['S', 'W', 'a', 'b', 'E', 'N']);
});

// Test that if the poles are not given, they are detected from the drawing
test('poles are detected from the drawing when none are given', () => {
  const result = createContactRepresentation(makeTwoInnerVertexGraph());
  assert.equal(result.polesSource, 'auto');
  assert.deepEqual(result.poles, contactPoles);
  assert.equal(result.relValid, true, result.relProblems.join('; '));
});

// Test that if the poles are given, they are used and the REL is valid
test('non-PTP graphs are explained, not laid out', () => {
  // Quadrilateral inner face (missing diagonal a-b).
  const quad = makeTwoInnerVertexGraph();
  quad.edges = quad.edges.filter((e) => e.id !== 'ab');
  let result = createRepresentation(quad);
  assert.equal(result.valid, true);
  assert.equal(result.relValid, false);
  assert.ok(result.relProblems.some((p) => p.includes('not a triangle')), result.relProblems.join('; '));

  // Separating triangle: a vertex inside face C-N-E of the wheel
  const sep = makeWheelGraph();
  sep.vertices.push({ id: 'x', x: 30, y: -30 });
  sep.edges.push(edge('x1', 'x', 'C'), edge('x2', 'x', 'N'), edge('x3', 'x', 'E'));
  result = createRepresentation(sep);
  assert.ok(result.relProblems.some((p) => p.includes('separating triangle')), result.relProblems.join('; '));

  // Five outer vertices
  const five = {
    // The five outer vertices are in clockwise order, so the embedding is clockwise. The inner vertex M is connected to all five outer vertices.
    vertices: [
      { id: 'A', x: 0, y: -100 }, { id: 'B', x: 95, y: -30 }, { id: 'C', x: 60, y: 80 },
      { id: 'D', x: -60, y: 80 }, { id: 'F', x: -95, y: -30 }, { id: 'M', x: 0, y: 0 }
    ],
    edges: [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'F'], ['F', 'A'],
      ['M', 'A'], ['M', 'B'], ['M', 'C'], ['M', 'D'], ['M', 'F']].map(([from, to], i) => edge(`e${i}`, from, to))
  };
  result = createContactRepresentation(five);
  assert.ok(result.relProblems.some((p) => p.includes('has 5 vertices')), result.relProblems.join('; '));
});

test('crossing edges fail the Euler check', () => {
  // Same graph as makeTwoInnerVertexGraph, but a and b swap sides, so a-W and b-E cross.
  // The polar orders read off this drawing are not a planar embedding.
  const graph = makeTwoInnerVertexGraph();
  graph.vertices.find((v) => v.id === 'a').x = 40;
  graph.vertices.find((v) => v.id === 'a').y = 10;
  graph.vertices.find((v) => v.id === 'b').x = -40;
  graph.vertices.find((v) => v.id === 'b').y = -10;
  const result = createRepresentation(graph);
  assert.equal(result.valid, true, result.problems.join('; '));
  assert.equal(result.relValid, false);
  assert.ok(result.relProblems.some((p) => p.includes('not planar')), result.relProblems.join('; '));
});

// ---------- XML round trip ----------

// Draw the two-inner-vertex graph in the editor's pixel grid (ORIGIN 50, GRID 50).
function makeEditorGraph() {
  const g = new Graph('two-inner');
  [[250, 50], [450, 250], [250, 450], [50, 250], [200, 250], [300, 250]]
    .forEach(([x, y]) => g.addVertex(x, y));         // ids 0..5 = N, E, S, W, a, b
  [[0, 1], [1, 2], [2, 3], [3, 0], [4, 3], [4, 0], [4, 2], [4, 5], [5, 0], [5, 2], [5, 1]]
    .forEach(([from, to]) => g.addEdge(from, to));
  return g;
}

// Test that the XML round trip preserves the graph structure and circular orders
test('Graph.toXML -> parsePlanarGraphXML keeps vertices, edges and circular orders', () => {
  const g = makeEditorGraph();
  const xml = g.toXML();
  const { graph, problems } = parsePlanarGraphXML(xml);

  assert.deepEqual(problems, []);
  assert.deepEqual(graph.vertices, g.vertices);
  assert.deepEqual(graph.edges, g.edges);
  assert.equal(graph.poles, undefined, 'outer face not selected');
  const expected = g.toRotationSystem();
  assert.deepEqual(
    graph.embedding.rotationSystem,
    expected.map((r) => ({ vertex: r.vertex.id, neighbors: r.neighbors }))
  );
});

// 
test('XML with selected poles goes all the way to a REL', () => {
  const g = makeEditorGraph();
  const xml = g.toXML({ poles: { north: 0, east: 1, south: 2, west: 3 } });
  assert.match(xml, /<outerFace status="selected">/);

  // Test that the XML round trip preserves the graph structure and circular orders
  const result = createContactRepresentationFromXML(xml);
  assert.equal(result.valid, true, result.problems.join('; '));
  assert.equal(result.rotationSource, 'xml');
  assert.equal(result.polesSource, 'xml');
  assert.equal(result.relValid, true, result.relProblems.join('; '));
  assert.deepEqual(result.canonicalOrder, [2, 3, 4, 5, 1, 0]);
});

// Test that counterclockwise XML is read back as clockwise
test('counterclockwise XML is read back as clockwise', () => {
  const xml = makeEditorGraph().toXML().replace('direction="clockwise"', 'direction="counterclockwise"');
  const { graph } = parsePlanarGraphXML(xml);
  const cw = parsePlanarGraphXML(makeEditorGraph().toXML()).graph;
  for (let i = 0; i < graph.embedding.rotationSystem.length; i++) {
    assert.deepEqual(graph.embedding.rotationSystem[i].neighbors, [...cw.embedding.rotationSystem[i].neighbors].reverse());
  }
});

// Test that malformed XML is reported
test('malformed XML is reported', () => {
  for (const bad of ['<planarGraph schemaVersion="1"><vertices></planarGraph>', 'not xml', '<other/>']) {
    const result = createContactRepresentationFromXML(bad);
    assert.equal(result.valid, false);
    assert.ok(result.problems.length > 0, bad);
  }
});

// ---------- fuzz: random PTP graphs through the whole chain ----------

function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random guillotine dissection of a rectangle plus four pole strips. Its contact graph is
// always a PTP graph (no four rectangles meet in a point with random real cuts).
function randomDissectionGraph(random, count) {

  // Start with a single rectangle, and repeatedly split a random rectangle either vertically or horizontally.
  const rects = [{ x1: 0, y1: 0, x2: 1, y2: 1 }];
  while (rects.length < count) {
    const i = Math.floor(random() * rects.length); // pick a random rectangle to split
    const r = rects[i]; // 
    const t = 0.25 + 0.5 * random(); // split at a random point in the middle half of the rectangle
    
    // Split the rectangle either vertically or horizontally, creating two new rectangles in place of the old one.
    if (random() < 0.5) {
      const x = r.x1 + t * (r.x2 - r.x1);
      rects.splice(i, 1, { ...r, x2: x }, { ...r, x1: x });
    } 
    // Split the rectangle either vertically or horizontally, creating two new rectangles in place of the old one.
    else {
      const y = r.y1 + t * (r.y2 - r.y1);
      rects.splice(i, 1, { ...r, y2: y }, { ...r, y1: y });
    }
  }

  // Add four pole strips around the rectangle, so that the contact graph is always a PTP graph (no four rectangles meet in a point).
  const all = rects.map((r, i) => ({ id: i, ...r }));

  // Add four pole strips around the rectangle, so that the contact graph is always a PTP graph (no four rectangles meet in a point).
  all.push(
    { id: 'N', x1: 0, y1: -1, x2: 1, y2: 0 }, { id: 'S', x1: 0, y1: 1, x2: 1, y2: 2 },
    { id: 'W', x1: -1, y1: -1, x2: 0, y2: 2 }, { id: 'E', x1: 1, y1: -1, x2: 2, y2: 2 }
  );

  // Two rectangles touch if they overlap in x and y, or if they are adjacent in x or y. 
  // The latter is detected by checking if the distance between the edges is less than a small epsilon.
  const touch = (a, b) => {
    const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
    const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    const near = (p, q) => Math.abs(p - q) < 1e-12;
    return ((near(a.x2, b.x1) || near(b.x2, a.x1)) && oy > 1e-12) ||
      ((near(a.y2, b.y1) || near(b.y2, a.y1)) && ox > 1e-12);
  };

  // Build the contact graph edges from the rectangles. The poles are not connected to each other.
  const edges = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const pair = [all[i].id, all[j].id];
      if (pair.includes('N') && pair.includes('S')) continue;
      if (pair.includes('E') && pair.includes('W')) continue;
      if (touch(all[i], all[j])) edges.push([all[i].id, all[j].id]);
    }
  }

  // Return the rectangle ids and the contact graph edges. The poles are always present
  return { ids: all.map((r) => r.id), edges };
}

// Tutte embedding: poles fixed on a convex quadrilateral, every inner vertex at the
// average of its neighbors. Planar straight-line for 3-connected graphs.
function tutteCoordinates(ids, edges) { 

  // Fix the poles at the corners of a square, and place every other vertex at the average of its neighbors. 
  // Iterate until convergence.
  const fixed = { N: [0, -100], E: [100, 0], S: [0, 100], W: [-100, 0] };
  const nbrs = new Map(ids.map((id) => [id, []]));
  for (const [a, b] of edges) { nbrs.get(a).push(b); nbrs.get(b).push(a); }
  const pos = new Map(ids.map((id) => [id, fixed[id] ? [...fixed[id]] : [0, 0]]));
  
  // Iterate until convergence.
  for (let iter = 0; iter < 20000; iter++) {
    let delta = 0;

    // Iterate over all vertices, updating the position of each non-fixed vertex to the average of its neighbors.
    for (const id of ids) {
      if (fixed[id]) continue;
      const list = nbrs.get(id);
      const x = list.reduce((s, u) => s + pos.get(u)[0], 0) / list.length;
      const y = list.reduce((s, u) => s + pos.get(u)[1], 0) / list.length;
      delta = Math.max(delta, Math.abs(x - pos.get(id)[0]), Math.abs(y - pos.get(id)[1]));
      pos.set(id, [x, y]);
    }

    // Stop if the maximum change in position is less than a small threshold.
    if (delta < 1e-12) break;
  }
  return pos;
}

// Random edge flips (keeping the graph PTP) to get graphs that are not just guillotine duals.
function randomFlips(random, ids, edges, flips) {
  
  // Randomly flip edges in the contact graph while maintaining the PTP .
  for (let f = 0; f < flips; f++) {
    
    // Compute the Tutte embedding of the current graph to get coordinates for the vertices.
    const pos = tutteCoordinates(ids, edges);
    const vertices = ids.map((id) => ({ id, x: pos.get(id)[0], y: pos.get(id)[1] }));
    const adjacency = new Map(ids.map((id) => [id, []]));
    for (const [a, b] of edges) { adjacency.get(a).push(b); adjacency.get(b).push(a); }
    const { rotation } = PlanarREL.rotationFromCoordinates(vertices, adjacency);

    // Pick a random edge to flip. The edge must not be between two poles, and the new edge must not already exist.
    const k = Math.floor(random() * edges.length);
    const [u, v] = edges[k];
    if (['N', 'E', 'S', 'W'].includes(u) && ['N', 'E', 'S', 'W'].includes(v)) continue;
    const list = rotation.get(u);
    const i = list.indexOf(v);
    const a = list[(i + 1) % list.length], b = list[(i - 1 + list.length) % list.length];
    if (a === b || adjacency.get(a).includes(b)) continue;

    // Flip the edge u-v to a-b, and check if the new graph is still PTP by computing its Tutte embedding and REL.
    const candidate = edges.filter((_, j) => j !== k).concat([[a, b]]);
    const p2 = tutteCoordinates(ids, candidate);
    const v2 = ids.map((id) => ({ id, x: p2.get(id)[0], y: p2.get(id)[1] }));
    const adj2 = new Map(ids.map((id) => [id, []]));
    for (const [x, y] of candidate) { adj2.get(x).push(y); adj2.get(y).push(x); }
    const r2 = PlanarREL.rotationFromCoordinates(v2, adj2);
    if (r2.problems.length) continue;
    const norm = PlanarREL.normalizeOrientation(r2.rotation, contactPoles);
    if (norm.problems.length || PlanarREL.checkPTP(norm.rotation, contactPoles).length) continue;
    edges = candidate;
  }
  return edges;
}

// Random PTP graphs: editor Graph -> XML -> circular orders -> REL -> rectangular dual
test('random PTP graphs: editor Graph -> XML -> circular orders -> REL -> rectangular dual', () => {
  const random = makeRandom(20261105); // reproducible random numbers
  let checked = 0;

  // Generate random PTP graphs by creating a random dissection graph, optionally flipping some edges, computing the Tutte embedding, and checking that the contact representation is valid and has a valid REL and rectangular dual.
  for (let trial = 0; trial < TRIALS; trial++) {
    const count = 2 + Math.floor(random() * 24);
    const { ids, edges: dissectionEdges } = randomDissectionGraph(random, count);
    const edges = trial % 2 ? randomFlips(random, ids, dissectionEdges, 15) : dissectionEdges;
    const pos = tutteCoordinates(ids, edges);

    // Create a Graph object with the vertices and edges, and convert it to XML. Then create a contact representation from the XML and check that it is valid, has the correct poles, has a valid REL, and has a valid rectangular dual.
    const g = new Graph(`fuzz-${trial}`);
    g.vertices = ids.map((id) => ({ id, x: pos.get(id)[0], y: pos.get(id)[1] }));
    g.edges = edges.map(([from, to], i) => ({ id: i, from, to }));

    // Randomly decide whether to include the poles in the XML or not. 
    // If included, the poles are specified in the XML; if not, they are detected from the drawing.
    const withPoles = trial % 3 === 0;
    const xml = g.toXML(withPoles ? { poles: contactPoles } : undefined);
    const result = createContactRepresentationFromXML(xml);

    const context = `trial ${trial} (${ids.length} vertices)`;
    assert.equal(result.valid, true, `${context}: ${result.problems.join('; ')}`);
    assert.deepEqual(result.poles, contactPoles, context);
    assert.equal(result.relValid, true, `${context}: ${result.relProblems.join('; ')}`);

    // The canonical order is a topological sort of the REL, starting from the south pole and ending at the north pole. 
    // The first two vertices in the order are the south and west poles, and the last vertex is the north pole.
    const order = result.canonicalOrder;
    assert.equal(new Set(order).size, ids.length, context);
    assert.deepEqual([order[0], order[1], order[order.length - 1]], ['S', 'W', 'N'], context);
    assert.equal(result.rel.red.length + result.rel.blue.length, edges.length - 4, context);
    
    // Rectangular dual: every edge is a shared side, nothing else touches or overlaps.
    assert.equal(result.layoutValid, true, `${context}: ${result.layoutProblems.join('; ')}`);
    assert.equal(result.contacts.length, edges.length, context);
    checked++;
  }
  assert.equal(checked, TRIALS);
});

// Run the contact-representation checks if this file is executed directly
if (require.main === module) {
  console.log('Running contact-representation checks...');
  const graphs = [makeWheelGraph(), makeTwoInnerVertexGraph()];
 // Add random PTP graphs to the list of graphs to check
  for (const graph of graphs) {
    const result = createRepresentation(graph);
    console.log(JSON.stringify({
      valid: result.valid,
      traversalOrder: result.traversalOrder,
      adjacency: [...result.adjacency],
      canonicalOrder: result.canonicalOrder,
      rel: result.rel && result.rel.edges.filter((e) => e.color).map((e) => `${e.from}->${e.to} ${e.color}`),
      problems: [...result.problems, ...result.relProblems]
    }, null, 2));
  }
}
