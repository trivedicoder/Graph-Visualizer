const test = require('node:test');
const assert = require('node:assert/strict');
const { createContactRepresentation } = require('./Contact rep.js');

const poles = { N: 'N', E: 'E', S: 'S', W: 'W' };
const contactPoles = { north: poles.N, east: poles.E, south: poles.S, west: poles.W };
const outer = [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']].map(([from, to], i) => ({ id: `o${i}`, from, to }));
const edge = (id, from, to) => ({ id, from, to });

// Contact Rep builds its adjacency list from edges; no st-order is supplied.
function createRepresentation(graph) {
  return createContactRepresentation(graph, { poles: contactPoles });
}

function makeWheelGraph() {
  return {
    vertices: [
      { id: 'N', x: 0, y: 100 },
      { id: 'E', x: 100, y: 0 },
      { id: 'S', x: 0, y: -100 },
      { id: 'W', x: -100, y: 0 },
      { id: 'C', x: 0, y: 0 }
    ],
    edges: [
      ...outer,
      edge('c1', 'C', 'N'),
      edge('c2', 'C', 'E'),
      edge('c3', 'C', 'S'),
      edge('c4', 'C', 'W')
    ]
  };
}

function makeTwoInnerVertexGraph() {
  return {
    vertices: [
      { id: 'N', x: 0, y: 100 },
      { id: 'E', x: 100, y: 0 },
      { id: 'S', x: 0, y: -100 },
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

test('wheel graph builds adjacency and traverses without a supplied st-order', () => {
  const graph = makeWheelGraph();
  const result = createRepresentation(graph);

  assert.equal(result.valid, true, result.problems.join('; '));
  assert.deepEqual(result.adjacency.get('C'), ['N', 'E', 'S', 'W']);
  assert.equal(result.traversalOrder.length, graph.vertices.length);
  assert.ok(result.traversalOrder.includes('N'));
  assert.ok(result.traversalOrder.includes('C'));
  assert.ok(result.rectangles.C);
  assert.equal(result.layoutValid, false, 'rectangle placement is still a placeholder');
});

test('two inner vertices are connected through the edge-derived adjacency list', () => {
  const graph = makeTwoInnerVertexGraph();
  const result = createRepresentation(graph);

  assert.equal(result.valid, true, result.problems.join('; '));
  assert.deepEqual(result.adjacency.get('a'), ['W', 'N', 'S', 'b']);
  assert.equal(result.traversalOrder.length, graph.vertices.length);
  assert.ok(result.traversalOrder.includes('a'));
  assert.ok(result.traversalOrder.includes('b'));
  assert.ok(result.rectangles.a);
  assert.ok(result.rectangles.b);
  assert.equal(result.layoutValid, false, 'rectangle placement is still a placeholder');
});

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
  assert.deepEqual(result.adjacency.get('a'), ['c', 'b']);
  assert.deepEqual(result.traversalOrder, ['a', 'c', 'b']);
});

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

if (require.main === module) {
  console.log('Running contact-representation checks...');
  const graphs = [makeWheelGraph(), makeTwoInnerVertexGraph()];
  for (const graph of graphs) {
    const result = createRepresentation(graph);
    console.log(JSON.stringify({
      valid: result.valid,
      traversalOrder: result.traversalOrder,
      adjacency: [...result.adjacency],
      problems: result.problems
    }, null, 2));
  }
}