const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createContactRepresentation,
  createContactRepresentationFromXML
} = require('./Contact rep.js');
const { parsePlanarGraphXML } = require('./PlanarXML.js');
const Graph = require('../../Frontend/js/Graph.js');

const edge = (id, from, to) => ({ id, from, to });

function makePathGraph() {
  return {
    vertices: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 30, y: 0 },
      { id: 'c', x: 80, y: 0 }
    ],
    edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')]
  };
}

test('infers unequal square sizes and creates exact side contacts', () => {
  const result = createContactRepresentation(makePathGraph());

  assert.equal(result.valid, true);
  assert.equal(result.layoutValid, true, result.layoutProblems.join('; '));
  assert.equal(result.contacts.length, 2);
  for (const square of Object.values(result.squares)) {
    assert.equal(square.width, square.height);
    assert.ok(square.width > 0);
  }
  assert.notEqual(result.squareSizes.a, result.squareSizes.c);
  assert.deepEqual(result.traversalOrder, ['a', 'b', 'c']);
});

test('accepts disconnected components when their squares do not touch', () => {
  const result = createContactRepresentation({
    vertices: [{ id: 'left', x: 0, y: 0 }, { id: 'right', x: 100, y: 0 }],
    edges: []
  });

  assert.equal(result.layoutValid, true, result.layoutProblems.join('; '));
  assert.equal(result.contacts.length, 0);
  assert.equal(result.traversalOrder.length, 2);
});

test('rejects diagonal edges instead of returning an approximate layout', () => {
  const result = createContactRepresentation({
    vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 30, y: 30 }],
    edges: [edge('ab', 'a', 'b')]
  });

  assert.equal(result.valid, true);
  assert.equal(result.layoutValid, false);
  assert.ok(result.layoutProblems.some((problem) => problem.includes('same row or column')));
  assert.deepEqual(result.squares, {});
});

test('reports incompatible cycles when no positive square sizes exist', () => {
  const result = createContactRepresentation({
    vertices: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 30, y: 0 },
      { id: 'c', x: 60, y: 0 }
    ],
    edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('ca', 'c', 'a')]
  });

  assert.equal(result.valid, true);
  assert.equal(result.layoutValid, false);
  assert.ok(result.layoutProblems.some((problem) => problem.includes('positive square sizes')));
});

test('rejects squares that overlap or touch without a graph edge', () => {
  const result = createContactRepresentation({
    vertices: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 30, y: 0 },
      { id: 'c', x: 30, y: 35 }
    ],
    edges: [edge('ab', 'a', 'b')]
  });

  assert.equal(result.valid, true);
  assert.equal(result.layoutValid, false);
  assert.ok(result.layoutProblems.some((problem) => problem.includes("Squares 'b' and 'c' touch")));
});

test('validates malformed graph structure before constructing squares', () => {
  const result = createContactRepresentation({
    vertices: [{ id: 'a', x: 0, y: 0 }],
    edges: [edge('bad', 'a', 'missing')]
  });

  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.includes('unknown target')));
});

test('Graph XML round-trip preserves graph data for square construction', () => {
  const graph = new Graph('path');
  graph.vertices = [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: 30, y: 0 },
    { id: 2, x: 80, y: 0 }
  ];
  graph.edges = [edge(0, 0, 1), edge(1, 1, 2)];
  const { graph: parsed, problems } = parsePlanarGraphXML(graph.toXML());

  assert.deepEqual(problems, []);
  assert.deepEqual(parsed.vertices, graph.vertices);
  assert.deepEqual(parsed.edges, graph.edges);
  assert.equal(parsed.embedding, undefined);
  const result = createContactRepresentationFromXML(graph.toXML());
  assert.equal(result.layoutValid, true, result.layoutProblems.join('; '));
});

test('XML square construction does not require a planar rotation system', () => {
  const graph = new Graph('same-ray');
  graph.vertices = [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: 20, y: 0 },
    { id: 2, x: 60, y: 0 }
  ];
  graph.edges = [edge(0, 0, 1), edge(1, 0, 2)];

  const result = createContactRepresentationFromXML(graph.toXML());
  assert.equal(result.valid, true);
  assert.equal(result.layoutValid, false);
  assert.ok(result.layoutProblems.some((problem) => problem.includes('overlap')));
});

test('malformed XML is reported', () => {
  for (const xml of ['<planarGraph schemaVersion="1"><vertices></planarGraph>', 'not xml', '<other/>']) {
    const result = createContactRepresentationFromXML(xml);
    assert.equal(result.valid, false);
    assert.ok(result.problems.length > 0, xml);
  }
});
