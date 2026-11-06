
const test = require('node:test'); 
const assert = require('node:assert/strict');
const { createContactRepresentation, createContactRepresentationFromXML } = require('./Contact rep.js');
const { parsePlanarGraphXML } = require('./PlanarXML.js');
const PlanarREL = require('./REL.js');
const Graph = require('../../Frontend/js/Graph.js');

// The tests follow the graph through the whole pipeline:
// edges give adjacency, coordinates or XML give the polar order, and the poles
// set the embedding's direction. The REL checks the graph and gives its canonical
// order. A valid REL can then be turned into a rectangular layout.
// Small examples test each step; generated graphs test the full XML-to-layout flow.
const poles = { N: 'N', E: 'E', S: 'S', W: 'W' };
const contactPoles = { north: poles.N, east: poles.E, south: poles.S, west: poles.W };
const outer = [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']].map(([from, to], i) => ({ id: `o${i}`, from, to }));
const edge = (id, from, to) => ({ id, from, to });
const TRIALS = Number(process.env.FUZZ_TRIALS || 120);

// Use the same poles for each example; let the code find the canonical order.
function createRepresentation(graph) {
  return createContactRepresentation(graph, { poles: contactPoles });
}

// A circular order is the same even if it starts at a different neighbor.
function assertSameCircularOrder(actual, expected) {
  assert.equal(actual.length, expected.length, `${actual} vs ${expected}`);
  const start = actual.indexOf(expected[0]);
  assert.ok(start >= 0, `${actual} vs ${expected}`);
  assert.deepEqual(actual.slice(start).concat(actual.slice(0, start)), expected);
}

function graphEdgeCount(graph) {
  return graph.edges.length;
}

// Return the red and blue edges in the REL.
function colorsOf(result) {
  const colors = {};
  for (const e of result.rel.edges) if (e.color) colors[`${e.from}->${e.to}`] = e.color;
  return colors;
}

// These small examples have known embeddings, RELs, and layouts.
function makeWheelGraph() {
  return {
    vertices: [
      { id: 'N', x: 0, y: -100 },
      { id: 'E', x: 100, y: 0 },
      { id: 'S', x: 0, y: 100 },
      { id: 'W', x: -100, y: 0 },
      { id: 'C', x: 0, y: 0 }
    ],
    // The outer cycle is clockwise; C connects to all four poles.
    edges: [
      ...outer,
      edge('c1', 'C', 'N'),
      edge('c2', 'C', 'E'),
      edge('c3', 'C', 'S'),
      edge('c4', 'C', 'W')
    ]
  };
}

// A clockwise example with two inner vertices joined by an edge.
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

// ---------- Input graph and embedding ----------
// Edges give the adjacency list. Coordinates or an XML rotation system give the
// polar order used for traversal.
test('wheel graph builds adjacency and traverses without a supplied st-order', () => {
  const graph = makeWheelGraph();
  const result = createRepresentation(graph);

  assert.equal(result.valid, true, result.problems.join('; '));
  assert.equal(result.rotationSource, 'coordinates');
  // C's neighbors are in clockwise polar order, starting at N.
  assertSameCircularOrder(result.adjacency.get('C'), ['N', 'E', 'S', 'W']);
  assert.equal(result.traversalOrder.length, graph.vertices.length);
  assert.ok(result.traversalOrder.includes('N'));
  assert.ok(result.traversalOrder.includes('C'));
  assert.ok(result.rectangles.C);
  assert.equal(result.layoutValid, true, result.layoutProblems.join('; '));
});

test('two inner vertices are connected through the edge-derived adjacency list', () => {
  const graph = makeTwoInnerVertexGraph();
  const result = createRepresentation(graph);

  assert.equal(result.valid, true, result.problems.join('; '));
  assertSameCircularOrder(result.adjacency.get('a'), ['N', 'b', 'S', 'W']);
  assert.equal(result.traversalOrder.length, graph.vertices.length);
  assert.ok(result.traversalOrder.includes('a'));
  assert.ok(result.traversalOrder.includes('b'));
  assert.ok(result.rectangles.a);
  assert.ok(result.rectangles.b);
  assert.equal(result.layoutValid, true, result.layoutProblems.join('; '));
});

// Use the XML rotation system instead of calculating the order from coordinates.
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

  assert.equal(result.valid, true, result.problems.join('; '));
  assert.equal(result.rotationSource, 'xml');
  assert.deepEqual(result.adjacency.get('a'), ['c', 'b']);
  assert.deepEqual(result.traversalOrder, ['a', 'c', 'b']);
  assert.equal(result.relValid, false, 'a path is not a PTP graph');
});

// Each neighbor in the rotation system must have an edge.
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

  const result = createContactRepresentation(graph);
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.includes("Rotation for vertex 'a'")));
});
// Overlapping edges from one vertex have no clear polar order.
test('overlapping edges make the circular order undefined', () => {
  const graph = {
    vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }, { id: 'c', x: 2, y: 0 }],
    edges: [edge('ab', 'a', 'b'), edge('ac', 'a', 'c')]
  };
  const result = createContactRepresentation(graph);
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.includes('overlap')));
});

// ---------- REL and canonical order ----------
// The embedding and poles determine the REL, which gives the canonical order.

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

// In the rectangular dual, each graph edge should be one shared rectangle side.
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

// Without a valid REL, no rectangular layout can be made.
test('no REL means no rectangles, with the reason', () => {
  const quad = makeTwoInnerVertexGraph();
  quad.edges = quad.edges.filter((e) => e.id !== 'ab');
  const result = createRepresentation(quad);
  assert.deepEqual(result.rectangles, {});
  assert.equal(result.layoutValid, false);
  assert.ok(result.layoutProblems[0].includes('No rectangular dual'));
});

// Pole orientation keeps the REL the same when the screen's y direction is reversed.
test('y-up coordinates give the same REL (orientation is normalized from the poles)', () => {
  const graph = makeTwoInnerVertexGraph();
  graph.vertices.forEach((v) => { v.y = -v.y; });
  const result = createRepresentation(graph);
  assert.equal(result.relValid, true, result.relProblems.join('; '));
  assert.equal(result.rel.flipped, true);
  assert.deepEqual(result.canonicalOrder, ['S', 'W', 'a', 'b', 'E', 'N']);
});

// Poles can be given directly or found from the drawing.
test('poles are detected from the drawing when none are given', () => {
  const result = createContactRepresentation(makeTwoInnerVertexGraph());
  assert.equal(result.polesSource, 'auto');
  assert.deepEqual(result.poles, contactPoles);
  assert.equal(result.relValid, true, result.relProblems.join('; '));
});

// A graph can be valid and planar but still fail the REL's PTP rules.
test('non-PTP graphs are explained, not laid out', () => {
  // Without a-b, the inner face has four sides instead of three.
  const quad = makeTwoInnerVertexGraph();
  quad.edges = quad.edges.filter((e) => e.id !== 'ab');
  let result = createRepresentation(quad);
  assert.equal(result.valid, true);
  assert.equal(result.relValid, false);
  assert.ok(result.relProblems.some((p) => p.includes('not a triangle')), result.relProblems.join('; '));

  // A vertex inside this triangle makes it a separating triangle.
  const sep = makeWheelGraph();
  sep.vertices.push({ id: 'x', x: 30, y: -30 });
  sep.edges.push(edge('x1', 'x', 'C'), edge('x2', 'x', 'N'), edge('x3', 'x', 'E'));
  result = createRepresentation(sep);
  assert.ok(result.relProblems.some((p) => p.includes('separating triangle')), result.relProblems.join('; '));

  // A PTP graph must have four outer poles.
  const five = {
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
  // Swapping a and b makes the coordinate-based embedding non-planar.
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

// ---------- XML input ----------
// The editor saves vertices, edges, poles, and rotation system to XML.
// The parser reads them back so Contact Rep can build the embedding and REL.
function makeEditorGraph() {
  const g = new Graph('two-inner');
  [[250, 50], [450, 250], [250, 450], [50, 250], [200, 250], [300, 250]]
    .forEach(([x, y]) => g.addVertex(x, y));
  [[0, 1], [1, 2], [2, 3], [3, 0], [4, 3], [4, 0], [4, 2], [4, 5], [5, 0], [5, 2], [5, 1]]
    .forEach(([from, to]) => g.addEdge(from, to));
  return g;
}

// Check that XML keeps the graph and its rotation system, even without selected poles.
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

// Selected poles in the XML let parsing continue through REL creation.
test('XML with selected poles goes all the way to a REL', () => {
  const g = makeEditorGraph();
  const xml = g.toXML({ poles: { north: 0, east: 1, south: 2, west: 3 } });
  assert.match(xml, /<outerFace status="selected">/);

  const result = createContactRepresentationFromXML(xml);
  assert.equal(result.valid, true, result.problems.join('; '));
  assert.equal(result.rotationSource, 'xml');
  assert.equal(result.polesSource, 'xml');
  assert.equal(result.relValid, true, result.relProblems.join('; '));
  assert.deepEqual(result.canonicalOrder, [2, 3, 4, 5, 1, 0]);
});

// The parser converts either direction to the pipeline's clockwise convention.
test('counterclockwise XML is read back as clockwise', () => {
  const xml = makeEditorGraph().toXML().replace('direction="clockwise"', 'direction="counterclockwise"');
  const { graph } = parsePlanarGraphXML(xml);
  const cw = parsePlanarGraphXML(makeEditorGraph().toXML()).graph;
  for (let i = 0; i < graph.embedding.rotationSystem.length; i++) {
    assert.deepEqual(graph.embedding.rotationSystem[i].neighbors, [...cw.embedding.rotationSystem[i].neighbors].reverse());
  }
});

// Bad XML should report a problem before the later pipeline steps run.
test('malformed XML is reported', () => {
  for (const bad of ['<planarGraph schemaVersion="1"><vertices></planarGraph>', 'not xml', '<other/>']) {
    const result = createContactRepresentationFromXML(bad);
    assert.equal(result.valid, false);
    assert.ok(result.problems.length > 0, bad);
  }
});

// ---------- End-to-end generated graphs ----------
// Generated graphs test the same graph -> embedding -> XML -> REL -> layout flow
// with many shapes.

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

// Split a rectangle into smaller ones and add four outer pole rectangles.
// Their shared sides make a PTP graph for testing.
function randomDissectionGraph(random, count) {

  // Split one rectangle into two that share a side.
  const rects = [{ x1: 0, y1: 0, x2: 1, y2: 1 }];
  while (rects.length < count) {
    const i = Math.floor(random() * rects.length);
    const r = rects[i];
    const t = 0.25 + 0.5 * random();
    
    if (random() < 0.5) {
      const x = r.x1 + t * (r.x2 - r.x1);
      rects.splice(i, 1, { ...r, x2: x }, { ...r, x1: x });
    } 
    else {
      const y = r.y1 + t * (r.y2 - r.y1);
      rects.splice(i, 1, { ...r, y2: y }, { ...r, y1: y });
    }
  }

  const all = rects.map((r, i) => ({ id: i, ...r }));

  // Add a rectangle for each outer pole.
  all.push(
    { id: 'N', x1: 0, y1: -1, x2: 1, y2: 0 }, { id: 'S', x1: 0, y1: 1, x2: 1, y2: 2 },
    { id: 'W', x1: -1, y1: -1, x2: 0, y2: 2 }, { id: 'E', x1: 1, y1: -1, x2: 2, y2: 2 }
  );

  // Rectangles count as touching only when they share a side, not just a corner.
  const touch = (a, b) => {
    const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
    const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    const near = (p, q) => Math.abs(p - q) < 1e-12;
    return ((near(a.x2, b.x1) || near(b.x2, a.x1)) && oy > 1e-12) ||
      ((near(a.y2, b.y1) || near(b.y2, a.y1)) && ox > 1e-12);
  };

  // Make an edge for each shared side; opposite poles are not connected.
  const edges = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const pair = [all[i].id, all[j].id];
      if (pair.includes('N') && pair.includes('S')) continue;
      if (pair.includes('E') && pair.includes('W')) continue;
      if (touch(all[i], all[j])) edges.push([all[i].id, all[j].id]);
    }
  }

  // Return the vertex ids and edges.
  return { ids: all.map((r) => r.id), edges };
}

// Fix the poles on a quadrilateral, then place each inner vertex at the average
// of its neighbors. These coordinates are used to find the polar order.
function tutteCoordinates(ids, edges) { 

  // Set the pole positions and build each vertex's neighbor list.
  const fixed = { N: [0, -100], E: [100, 0], S: [0, 100], W: [-100, 0] };
  const nbrs = new Map(ids.map((id) => [id, []]));
  for (const [a, b] of edges) { nbrs.get(a).push(b); nbrs.get(b).push(a); }
  const pos = new Map(ids.map((id) => [id, fixed[id] ? [...fixed[id]] : [0, 0]]));
  
  for (let iter = 0; iter < 20000; iter++) {
    let delta = 0;

    // Move inner vertices toward their neighbors' average; stop when they settle.
    for (const id of ids) {
      if (fixed[id]) continue;
      const list = nbrs.get(id);
      const x = list.reduce((s, u) => s + pos.get(u)[0], 0) / list.length;
      const y = list.reduce((s, u) => s + pos.get(u)[1], 0) / list.length;
      delta = Math.max(delta, Math.abs(x - pos.get(id)[0]), Math.abs(y - pos.get(id)[1]));
      pos.set(id, [x, y]);
    }

    if (delta < 1e-12) break;
  }
  return pos;
}

// Try edge flips to make different graphs. Keep only flips that still pass
// the embedding and PTP checks.
function randomFlips(random, ids, edges, flips) {
  
  for (let f = 0; f < flips; f++) {
    
    // Find the current embedding to choose a replacement edge.
    const pos = tutteCoordinates(ids, edges);
    const vertices = ids.map((id) => ({ id, x: pos.get(id)[0], y: pos.get(id)[1] }));
    const adjacency = new Map(ids.map((id) => [id, []]));
    for (const [a, b] of edges) { adjacency.get(a).push(b); adjacency.get(b).push(a); }
    const { rotation } = PlanarREL.rotationFromCoordinates(vertices, adjacency);

    // Keep pole edges and avoid adding an edge twice.
    const k = Math.floor(random() * edges.length);
    const [u, v] = edges[k];
    if (['N', 'E', 'S', 'W'].includes(u) && ['N', 'E', 'S', 'W'].includes(v)) continue;
    const list = rotation.get(u);
    const i = list.indexOf(v);
    const a = list[(i + 1) % list.length], b = list[(i - 1 + list.length) % list.length];
    if (a === b || adjacency.get(a).includes(b)) continue;

    // Keep the new edge only if its embedding and REL still pass the PTP checks.
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

// Run generated graphs through the same XML, embedding, REL, and layout steps
// used for graphs loaded by the app.
test('random PTP graphs: editor Graph -> XML -> circular orders -> REL -> rectangular dual', () => {
  const random = makeRandom(20261105);
  let checked = 0;

  for (let trial = 0; trial < TRIALS; trial++) {
    const count = 2 + Math.floor(random() * 24);
    const { ids, edges: dissectionEdges } = randomDissectionGraph(random, count);
    const edges = trial % 2 ? randomFlips(random, ids, dissectionEdges, 15) : dissectionEdges;
    const pos = tutteCoordinates(ids, edges);

    // Save the graph with the editor's model and XML format.
    const g = new Graph(`fuzz-${trial}`);
    g.vertices = ids.map((id) => ({ id, x: pos.get(id)[0], y: pos.get(id)[1] }));
    g.edges = edges.map(([from, to], i) => ({ id: i, from, to }));

    // Sometimes save the poles in XML; otherwise find them from coordinates.
    const withPoles = trial % 3 === 0;
    const xml = g.toXML(withPoles ? { poles: contactPoles } : undefined);
    const result = createContactRepresentationFromXML(xml);

    const context = `trial ${trial} (${ids.length} vertices)`;
    assert.equal(result.valid, true, `${context}: ${result.problems.join('; ')}`);
    assert.deepEqual(result.poles, contactPoles, context);
    assert.equal(result.relValid, true, `${context}: ${result.relProblems.join('; ')}`);

    // Check the REL order and that it labels every non-pole edge.
    const order = result.canonicalOrder;
    assert.equal(new Set(order).size, ids.length, context);
    assert.deepEqual([order[0], order[1], order[order.length - 1]], ['S', 'W', 'N'], context);
    assert.equal(result.rel.red.length + result.rel.blue.length, edges.length - 4, context);
    
    // Check that every graph edge matches one shared rectangle side.
    assert.equal(result.layoutValid, true, `${context}: ${result.layoutProblems.join('; ')}`);
    assert.equal(result.contacts.length, edges.length, context);
    checked++;
  }
  assert.equal(checked, TRIALS);
});

// Run this file directly to print results for the two small examples.
if (require.main === module) {
  console.log('Running contact-representation checks...');
  const graphs = [makeWheelGraph(), makeTwoInnerVertexGraph()];
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
