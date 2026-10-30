const test = require('node:test');
const assert = require('node:assert/strict');
const { createContactRepresentation } = require('./Contact rep.js');

const poles = { N: 'N', E: 'E', S: 'S', W: 'W' };
const outer = [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']].map(([from, to], i) => ({ id: `o${i}`, from, to }));
const edge = (id, from, to) => ({ id, from, to });

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

test('wheel graph with one inner vertex builds a valid contact representation', () => {
  const graph = makeWheelGraph();
  const result = createContactRepresentation(graph, poles);

  assert.equal(result.valid, true, result.problems.join('; '));
  assert.ok(result.order.includes('N'));
  assert.ok(result.order.includes('C'));
  assert.ok(result.rectangles.C);
  assert.ok(result.contacts.some((contact) => contact.from === 'C' && contact.to === 'N'));
});

test('two inner vertices build a valid contact representation', () => {
  const graph = makeTwoInnerVertexGraph();
  const result = createContactRepresentation(graph, poles);

  assert.equal(result.valid, true, result.problems.join('; '));
  assert.ok(result.order.includes('a'));
  assert.ok(result.order.includes('b'));
  assert.ok(result.rectangles.a);
  assert.ok(result.rectangles.b);
  assert.ok(result.contacts.some((contact) => contact.from === 'a' && contact.to === 'b'));
});

if (require.main === module) {
  console.log('Running contact-representation checks...');
  const graphs = [makeWheelGraph(), makeTwoInnerVertexGraph()];
  for (const graph of graphs) {
    const result = createContactRepresentation(graph, poles);
    console.log(JSON.stringify({ valid: result.valid, order: result.order, problems: result.problems }, null, 2));
  }
}