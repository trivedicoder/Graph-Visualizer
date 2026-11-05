

// ---------- Contact representation scaffold ----------
// Input graph: { vertices: [{ id, x, y }], edges: [{ id?, from, to }] }
//
// Coordinate convention for rectangles: screen space (SVG / canvas),
// x grows to the right, y grows down. "top"/"bottom" below follow that.
//

//
// Pipeline:
//   1. validateGraph        - reject malformed input before anything is built
//   2. buildAdjacency       - build neighbor lists from the XML-derived edges
//   3. validateConnectivity / validatePoles / validateRotationSystem
//   4. buildTraversalOrder  - visit vertices by following adjacency neighbors
//   5. placeRectangles      - PLACEHOLDER (see TODO)
//   6. buildContacts        - derives contacts from geometry and verifies them



const EPS = 1e-9;
const PLACEHOLDER_SPACING = 52;
const PLACEHOLDER_SIZE = 40;


// ---------- helpers ----------

function edgeLabel(edge) {
  return edge.id != null ? String(edge.id) : `${edge.from}-${edge.to}`;
}

// Undirected key, so a-b and b-a are recognized as the same edge.
function edgeKey(a, b) {
  const [p, q] = [String(a), String(b)].sort();
  return `${p}\u0000${q}`;
}

// ---------- 1. input validation ----------

function validateGraph(graph) {
  const problems = [];

  if (!graph || typeof graph !== 'object') {
    return ['Graph must be an object with vertices and edges arrays.'];
  }
  if (!Array.isArray(graph.vertices) || graph.vertices.length === 0) {
    problems.push('Graph must include at least one vertex.');
  }
  if (!Array.isArray(graph.edges)) {
    problems.push('Graph must include an edge array.');
  }

  const vertexIds = new Set();
  for (const vertex of Array.isArray(graph.vertices) ? graph.vertices : []) {
    if (vertex == null || vertex.id == null) {
      problems.push('Every vertex needs an id.');
      continue;
    }
    if (vertexIds.has(vertex.id)) {
      problems.push(`Duplicate vertex id '${vertex.id}'.`);
    }
    vertexIds.add(vertex.id);

    // x/y are needed later to derive the planar embedding.
    if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)) {
      problems.push(`Vertex '${vertex.id}' needs numeric x and y.`);
    }
  }

  // Edges are checked against the declared vertex set, not against an
  // adjacency map, so unknown endpoints are actually caught.
  const seenEdges = new Map(); // undirected key -> label of first occurrence
  const seenEdgeIds = new Set();
  for (const edge of Array.isArray(graph.edges) ? graph.edges : []) {
    if (edge == null) {
      problems.push('Edge list contains an empty entry.');
      continue;
    }
    const label = edgeLabel(edge);

    if (edge.id != null) {
      if (seenEdgeIds.has(edge.id)) problems.push(`Duplicate edge id '${edge.id}'.`);
      seenEdgeIds.add(edge.id);
    }
    if (!vertexIds.has(edge.from)) {
      problems.push(`Edge '${label}' references unknown source '${edge.from}'.`);
    }
    if (!vertexIds.has(edge.to)) {
      problems.push(`Edge '${label}' references unknown target '${edge.to}'.`);
    }
    if (edge.from === edge.to) {
      problems.push(`Self-loop edge '${label}' is not valid for this layout.`);
      continue;
    }

    const key = edgeKey(edge.from, edge.to);
    if (seenEdges.has(key)) {
      problems.push(`Edge '${label}' duplicates edge '${seenEdges.get(key)}' (multi-edges are not allowed).`);
    } else {
      seenEdges.set(key, label);
    }
  }

  return problems;
}

// ---------- 2. adjacency (validated graphs only) ----------

// This is where the adjacency list is built from the XML-derived edge list:
// Map<vertexId, neighborId[]>. Each undirected edge adds both directions.
function buildAdjacency(graph) {
  const neighbourSets = new Map();
  for (const vertex of graph.vertices) neighbourSets.set(vertex.id, new Set());
  for (const edge of graph.edges) {
    neighbourSets.get(edge.from).add(edge.to);
    neighbourSets.get(edge.to).add(edge.from);
  }

  const adjacency = new Map();
  for (const [id, set] of neighbourSets) adjacency.set(id, [...set]);
  return adjacency;
}

// Make sure XML's candidate circular neighbor lists describe the same edges.
// This catches inconsistent input; it does not prove that the drawing is planar.
function validateRotationSystem(graph, adjacency) {
  const rotations = graph.embedding && graph.embedding.rotationSystem;
  if (rotations == null) return [];
  if (!Array.isArray(rotations)) {
    return ['graph.embedding.rotationSystem must be an array.'];
  }

  const problems = [];
  const rotationsByVertex = new Map();
  for (const rotation of rotations) {
    if (rotation == null || !adjacency.has(rotation.vertex)) {
      problems.push(`Rotation system references unknown vertex '${rotation && rotation.vertex}'.`);
      continue;
    }
    if (rotationsByVertex.has(rotation.vertex)) {
      problems.push(`Rotation system lists vertex '${rotation.vertex}' more than once.`);
      continue;
    }
    if (!Array.isArray(rotation.neighbors)) {
      problems.push(`Rotation for vertex '${rotation.vertex}' must have a neighbor array.`);
      continue;
    }

    const neighbors = new Set(rotation.neighbors);
    if (neighbors.size !== rotation.neighbors.length) {
      problems.push(`Rotation for vertex '${rotation.vertex}' contains duplicate neighbors.`);
    }
    for (const neighbor of rotation.neighbors) {
      if (!adjacency.get(rotation.vertex).includes(neighbor)) {
        problems.push(`Rotation for vertex '${rotation.vertex}' includes non-neighbor '${neighbor}'.`);
      }
    }
    rotationsByVertex.set(rotation.vertex, rotation.neighbors);
  }

  for (const [vertex, neighbors] of adjacency) {
    const rotation = rotationsByVertex.get(vertex);
    if (!rotation) {
      problems.push(`Rotation system is missing vertex '${vertex}'.`);
      continue;
    }
    if (rotation.length !== neighbors.length || neighbors.some((neighbor) => !rotation.includes(neighbor))) {
      problems.push(`Rotation for vertex '${vertex}' does not list exactly its adjacent vertices.`);
    }
  }
  return problems;
}

// Keep the XML's circular neighbor order when it is available. If this module
// is called without XML embedding data (for example, in a unit test), preserve
// the edge-list order instead.
function orderAdjacencyByRotation(adjacency, graph) {
  const rotations = graph.embedding && graph.embedding.rotationSystem;
  if (!Array.isArray(rotations)) return adjacency;

  const rotationsByVertex = new Map(rotations.map((rotation) => [rotation.vertex, rotation.neighbors]));
  return new Map(
    [...adjacency].map(([vertex, neighbors]) => [vertex, [...rotationsByVertex.get(vertex)]])
  );
}

// ---------- 3. structural checks ----------

function validateConnectivity(adjacency) {
  const [start] = adjacency.keys();
  if (start === undefined) return [];

  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  if (seen.size === adjacency.size) return [];
  const unreachable = [...adjacency.keys()].filter((id) => !seen.has(id));
  return [`Graph must be connected; unreachable from '${start}': ${unreachable.join(', ')}.`];
}

// Outer-face poles are passed explicitly instead of being guessed from IDs.
// Shape: { north, east, south, west }. Optional for adjacency processing.
function validatePoles(poles, adjacency) {
  if (poles == null) return [];
  if (typeof poles !== 'object') return ['options.poles must be { north, east, south, west }.'];

  const problems = [];
  const sides = ['north', 'east', 'south', 'west'];
  const used = new Map(); // vertex id -> side

  for (const side of sides) {
    const id = poles[side];
    if (id == null) {
      problems.push(`Pole '${side}' is missing.`);
    } else if (!adjacency.has(id)) {
      problems.push(`Pole '${side}' refers to unknown vertex '${id}'.`);
    } else if (used.has(id)) {
      problems.push(`Vertex '${id}' is used for both '${used.get(id)}' and '${side}' poles.`);
    } else {
      used.set(id, side);
    }
  }
  return problems;
}

// A simple adjacency-driven traversal gives this scaffold a stable processing
// order. It is not the refined canonical order used by the paper's algorithm.
function buildTraversalOrder(adjacency) {
  const [start] = adjacency.keys();
  if (start === undefined) return [];

  const order = [];
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const vertex = queue.shift();
    order.push(vertex);
    for (const neighbor of adjacency.get(vertex)) {
      if (!seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return order;
}

// ---------- 4. placement ----------

// TODO(placeholder): replace with the rectangular-dual construction. It will
// receive a traversal order, adjacency (including the candidate embedding) and `relation`
// (e.g. the regular edge labeling), and must return rectangles that touch
// exactly when their vertices are adjacent.
//
// Current behaviour: a simple grid where NO rectangles touch. buildContacts
// will therefore report every edge as a missing contact

function placeRectangles(traversalOrder, adjacency, relation) {
  const rectangles = {};
  traversalOrder.forEach((vertexId, index) => {
    rectangles[vertexId] = {
      id: vertexId,
      x: 20 + (index % 8) * PLACEHOLDER_SPACING,
      y: 20 + Math.floor(index / 8) * PLACEHOLDER_SPACING,
      width: PLACEHOLDER_SIZE,
      height: PLACEHOLDER_SIZE
    };
  });
  return rectangles;
}

// ---------- 5. contacts (derived from geometry, then verified) ----------

// Returns the shared boundary segment between rectangles a and b, or null.
// `side` is from a's point of view (y grows downward). A corner-only touch
// does not count as a contact.
function computeContact(a, b) {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const startX = Math.max(a.x, b.x);
  const startY = Math.max(a.y, b.y);

  if (Math.abs(a.x + a.width - b.x) < EPS && overlapY > EPS) {
    return { side: 'right', segment: { x1: b.x, y1: startY, x2: b.x, y2: startY + overlapY } };
  }
  if (Math.abs(b.x + b.width - a.x) < EPS && overlapY > EPS) {
    return { side: 'left', segment: { x1: a.x, y1: startY, x2: a.x, y2: startY + overlapY } };
  }
  if (Math.abs(a.y + a.height - b.y) < EPS && overlapX > EPS) {
    return { side: 'bottom', segment: { x1: startX, y1: b.y, x2: startX + overlapX, y2: b.y } };
  }
  if (Math.abs(b.y + b.height - a.y) < EPS && overlapX > EPS) {
    return { side: 'top', segment: { x1: startX, y1: a.y, x2: startX + overlapX, y2: a.y } };
  }
  return null;
}

function interiorsOverlap(a, b) {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapX > EPS && overlapY > EPS;
}

// Contacts only contain segments that really exist. Problems report:
//   - edges whose rectangles don't share a boundary
//   - non-adjacent rectangles that do share one
//   - any rectangles whose interiors overlap
function buildContacts(edges, rectangles, adjacency) {
  const contacts = [];
  const problems = [];

  for (const edge of edges) {
    const fromRect = rectangles[edge.from];
    const toRect = rectangles[edge.to];
    if (!fromRect || !toRect) {
      problems.push(`Edge '${edgeLabel(edge)}' has no rectangle for one of its endpoints.`);
      continue;
    }

    const contact = computeContact(fromRect, toRect);
    if (contact) {
      contacts.push({ id: edgeLabel(edge), from: edge.from, to: edge.to, ...contact });
    } else {
      problems.push(`Edge '${edgeLabel(edge)}': rectangles '${edge.from}' and '${edge.to}' do not share a boundary segment.`);
    }
  }

  const ids = Object.keys(rectangles);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = rectangles[ids[i]];
      const b = rectangles[ids[j]];
      if (interiorsOverlap(a, b)) {
        problems.push(`Rectangles '${a.id}' and '${b.id}' overlap.`);
        continue;
      }
      const adjacent = adjacency.get(a.id).includes(b.id);
      if (!adjacent && computeContact(a, b)) {
        problems.push(`Rectangles '${a.id}' and '${b.id}' touch but their vertices are not adjacent.`);
      }
    }
  }

  return { contacts, problems };
}

/**
 * @param {object} graph   { vertices: [{ id, x, y }], edges: [{ id?, from, to }] }
 * @param {object} options
 * @param {object} [options.poles]   { north, east, south, west } vertex ids
 * @param {*}      [options.relation] passed through to placement (e.g. edge labeling)
 * @description XML graph input must first be parsed into the graph shape above.
 * The adjacency list is built from edges; the XML rotation system only orders
 * each neighbor list. This scaffold does not compute the paper's canonical
 * order yet, and its rectangle placement is still a placeholder.
 * @returns {{
 *   rectangles: Object<string, {id, x, y, width, height}>,
 *   contacts: Array<{id, from, to, side, segment}>,
 *   adjacency: Map,
 *   traversalOrder: Array,
 *   problems: string[],       // input problems; if non-empty nothing was laid out
 *   valid: boolean,           // input is usable
 *   layoutProblems: string[], // geometry doesn't match the graph
 *   layoutValid: boolean      // rectangles form a correct contact representation
 * }}
 */
function createContactRepresentation(graph, options = {}) {
  const { poles, relation } = options;
  const empty = {
    rectangles: {},
    contacts: [],
    adjacency: new Map(),
    traversalOrder: [],
    problems: [],
    valid: false,
    layoutProblems: [],
    layoutValid: false
  };

  const graphProblems = validateGraph(graph);
  if (graphProblems.length) return { ...empty, problems: graphProblems };

  const adjacency = buildAdjacency(graph);
  const problems = [
    ...validateConnectivity(adjacency),
    ...validatePoles(poles, adjacency),
    ...validateRotationSystem(graph, adjacency)
  ];
  if (problems.length) return { ...empty, adjacency, problems };

  const orderedAdjacency = orderAdjacencyByRotation(adjacency, graph);
  const traversalOrder = buildTraversalOrder(orderedAdjacency);
  const rectangles = placeRectangles(traversalOrder, orderedAdjacency, relation);
  const { contacts, problems: layoutProblems } = buildContacts(graph.edges, rectangles, orderedAdjacency);

  return {
    rectangles,
    contacts,
    adjacency: orderedAdjacency,
    traversalOrder,
    problems: [],
    valid: true,
    layoutProblems,
    layoutValid: layoutProblems.length === 0
  };
}

const contactRepresentationAPI = {
  createContactRepresentation,
  validateGraph,
  buildAdjacency,
  validateRotationSystem,
  orderAdjacencyByRotation,
  buildTraversalOrder,
  validateConnectivity,
  validatePoles,
  placeRectangles,
  computeContact,
  buildContacts
};

// Keep the module usable by both the Node tests and the browser UI.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = contactRepresentationAPI;
}
if (typeof window !== 'undefined') {
  window.ContactRepresentation = contactRepresentationAPI;
}