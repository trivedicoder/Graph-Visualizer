
// ---------- Contact representation scaffold ----------
// Input graph: { vertices: [{ id, x, y }], edges: [{ id?, from, to }] }
//
// Coordinate convention for rectangles: screen space (SVG / canvas),
// x grows to the right, y grows down. "top"/"bottom" below follow that.
//

//
// Pipeline:
//   0. parsePlanarGraphXML  - planar-graph.xml -> graph object (PlanarXML.js)
//   1. validateGraph        - reject malformed input before anything is built
//   2. buildAdjacency       - build neighbor lists from the XML-derived edges
//   3. validateConnectivity / validatePoles / validateRotationSystem
//   4. buildRotation        - circular neighbor orders: XML rotation, else polar ordering
//   5. computeRegularEdgeLabeling (REL.js) - PTP check -> refined canonical order -> REL
//   6. buildTraversalOrder  - visit vertices by following adjacency neighbors
//   7. placeRectangles      - rectangular dual from the REL (slide 21), in grid units
//   8. buildContacts        - derives contacts from geometry and verifies them

const RelApi = typeof require === 'function' ? require('./REL.js') : window.PlanarREL;
const XmlApi = typeof require === 'function' ? require('./PlanarXML.js') : window.PlanarXML;

// ----------------- constants ----------
const EPS = 1e-9;


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

// Circular neighbor orders for the REL step. The XML rotation system wins; without one
// (e.g. a graph object built in a test) the order comes from polar ordering of x/y,
// exactly like Graph.toRotationSystem() does before writing the XML.
function buildRotation(adjacency, graph) {
  if (graph.embedding && Array.isArray(graph.embedding.rotationSystem)) {
    return { rotation: orderAdjacencyByRotation(adjacency, graph), source: 'xml', problems: [] };
  }
  const { rotation, problems } = RelApi.rotationFromCoordinates(graph.vertices, adjacency);
  return { rotation, source: 'coordinates', problems };
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

// ---------- 4. placement: rectangular dual (slide 21) ----------
//
//   G_ver = T_b (blue, south -> north) + outer edges S->W, W->N, S->E, E->N
//   G_hor = T_r (red,  west -> east)   + outer edges W->S, S->E, W->N, N->E
// Number the faces of each network by the longest path in its dual (a topological
// ordering): G_ver's dual runs west -> east and gives x, G_hor's dual runs south -> north
// and gives y. Vertex v gets x1 = f(face left of v), x2 = f(face right of v), and
// y1 = f(face below v), y2 = f(face above v).
//
// Faces are traced with the REL's normalized circular orders (clockwise with N on top):
// the face containing dart u -> v lies to the LEFT of u -> v.

function dartKey(a, b) {
  return `${String(a)}\u0000${String(b)}`;
}

// Longest-path numbering of one network's dual, plus each vertex's two bounding faces.
function numberNetwork(rotation, oriented, outerSides, dualFromLeftToRight, endsWithout) {
  // Circular orders restricted to this network's edges.
  const restricted = new Map(
    [...rotation].map(([v, list]) => [v, list.filter((u) => oriented.has(edgeKey(v, u)))])
  );

  const dartFace = new Map();
  RelApi.traceFaces(restricted).forEach((face, i) => {
    face.forEach((v, j) => dartFace.set(dartKey(v, face[(j + 1) % face.length]), i));
  });

  // The outer face is split into the dual's source side and sink side.
  const outerIndex = dartFace.get(dartKey(...outerSides.source[0]));
  const sideOf = new Map();
  for (const [a, b] of outerSides.source) sideOf.set(dartKey(a, b), 'source');
  for (const [a, b] of outerSides.sink) sideOf.set(dartKey(a, b), 'sink');
  const face = (a, b) => {
    const index = dartFace.get(dartKey(a, b));
    return index === outerIndex ? sideOf.get(dartKey(a, b)) : index;
  };
  const leftFace = (u, v) => face(u, v);
  const rightFace = (u, v) => face(v, u);

  // Dual edges: G_ver goes left face -> right face, G_hor goes right (below) -> left (above).
  const successors = new Map();
  const indegree = new Map();
  const node = (f) => {
    if (!successors.has(f)) { successors.set(f, []); indegree.set(f, 0); }
  };
  for (const [from, to] of oriented.values()) {
    const [a, b] = dualFromLeftToRight
      ? [leftFace(from, to), rightFace(from, to)]
      : [rightFace(from, to), leftFace(from, to)];
    node(a); node(b);
    successors.get(a).push(b);
    indegree.set(b, indegree.get(b) + 1);
  }

  const number = new Map([...successors.keys()].map((f) => [f, 0]));
  const queue = [...successors.keys()].filter((f) => indegree.get(f) === 0);
  let visited = 0;
  while (queue.length) {
    const f = queue.shift();
    visited++;
    for (const g of successors.get(f)) {
      number.set(g, Math.max(number.get(g), number.get(f) + 1));
      indegree.set(g, indegree.get(g) - 1);
      if (indegree.get(g) === 0) queue.push(g);
    }
  }
  if (visited !== successors.size) throw new Error('Dual network has a cycle; the REL is not consistent.');

  // Each vertex's outgoing edges are consecutive in its circular order. The first one
  // bounds the vertex on one side and the last one on the other.
  const bounds = new Map();
  for (const [v, list] of restricted) {
    const isOut = (u) => oriented.get(edgeKey(v, u))[0] === v;
    let lowFace, highFace;
    if (list.some(isOut)) {
      let start = list.findIndex((u, i) => isOut(u) && !isOut(list[(i - 1 + list.length) % list.length]));
      if (start < 0) start = list.indexOf(endsWithout.sourceStart);  // only outgoing edges
      const seq = list.slice(start).concat(list.slice(0, start)).filter(isOut);
      const first = seq[0], last = seq[seq.length - 1];
      [lowFace, highFace] = dualFromLeftToRight
        ? [leftFace(v, first), rightFace(v, last)]     // x: left of first, right of last
        : [rightFace(v, last), leftFace(v, first)];    // y: below last, above first
    } else {
      const start = list.indexOf(endsWithout.sinkStart);              // only incoming edges
      const seq = list.slice(start).concat(list.slice(0, start));
      const first = seq[0], last = seq[seq.length - 1];
      [lowFace, highFace] = dualFromLeftToRight
        ? [leftFace(last, v), rightFace(first, v)]
        : [rightFace(first, v), leftFace(last, v)];
    }
    bounds.set(v, [number.get(lowFace), number.get(highFace)]);
  }
  return { bounds, max: number.get('sink') };
}

function rectangularDual(rel) {
  const { rotation, poles } = rel;
  const { north: N, east: E, south: S, west: W } = poles;
  const network = (color, outerEdges) => {
    const oriented = new Map();
    for (const e of rel.edges) if (e.color === color) oriented.set(edgeKey(e.from, e.to), [e.from, e.to]);
    for (const [a, b] of outerEdges) oriented.set(edgeKey(a, b), [a, b]);
    return oriented;
  };

  // x from G_ver: outer face darts S->W, W->N are the west side; N->E, E->S the east side.
  const ver = numberNetwork(
    rotation,
    network('blue', [[S, W], [W, N], [S, E], [E, N]]),
    { source: [[S, W], [W, N]], sink: [[N, E], [E, S]] },
    true,
    { sourceStart: W, sinkStart: E }
  );
  // y from G_hor: outer face darts S->W, E->S are the south side; W->N, N->E the north side.
  const hor = numberNetwork(
    rotation,
    network('red', [[W, S], [S, E], [W, N], [N, E]]),
    { source: [[S, W], [E, S]], sink: [[W, N], [N, E]] },
    false,
    { sourceStart: N, sinkStart: S }
  );

  const box = new Map();
  for (const v of rotation.keys()) {
    const [x1, x2] = ver.bounds.get(v);
    const [y1, y2] = hor.bounds.get(v);
    box.set(v, { x1, x2, y1, y2 });
  }

  // The four poles come out as full-length strips that overlap at the corners. Trim them
  // into a pinwheel so N-E, E-S, S-W and W-N each share a side (the frame on slide 22).
  const n = box.get(N), e = box.get(E), s = box.get(S), w = box.get(W);
  const innerLeft = w.x2, innerRight = e.x1, innerBottom = s.y2, innerTop = n.y1;
  Object.assign(n, { x1: 0, x2: innerRight });
  Object.assign(e, { y1: innerBottom, y2: hor.max });
  Object.assign(s, { x1: innerLeft, x2: ver.max });
  Object.assign(w, { y1: 0, y2: innerTop });

  // Screen space: y grows down, so flip y.
  const rectangles = {};
  for (const [v, b] of box) {
    rectangles[v] = { id: v, x: b.x1, y: hor.max - b.y2, width: b.x2 - b.x1, height: b.y2 - b.y1 };
  }
  return { rectangles, width: ver.max, height: hor.max };
}

// Rectangles in grid units (integers), or {} when there is no REL to build from.
function placeRectangles(traversalOrder, adjacency, relation) {
  if (!relation || !relation.rotation) return {};
  return rectangularDual(relation).rectangles;
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
 * @param {object} graph   { vertices: [{ id, x, y }], edges: [{ id?, from, to }],
 *                           embedding?: { rotationSystem }, poles? }  (parsed XML shape)
 * @param {object} options
 * @param {object} [options.poles]   { north, east, south, west } vertex ids
 *                                   (falls back to graph.poles from the XML, then auto-detect)
 * @param {*}      [options.relation] overrides the computed REL for placement
 * @description The adjacency list is built from edges; the XML rotation system (or polar
 * ordering of x/y when there is none) gives each neighbor list its circular order. From
 * that, REL.js checks the PTP conditions, computes the refined canonical order and the
 * regular edge labeling, and builds the rectangular dual from it (grid units, y down).
 * @returns {{
 *   rectangles: Object<string, {id, x, y, width, height}>,  // grid units, y grows down
 *   layoutSize: {width, height}|null, // bounding box of the rectangles
 *   contacts: Array<{id, from, to, side, segment}>,
 *   adjacency: Map,           // circular neighbor order per vertex
 *   rotationSource: string,   // 'xml' or 'coordinates'
 *   traversalOrder: Array,
 *   poles: object|null,       // poles used for the REL
 *   polesSource: string|null, // 'given', 'xml', or 'auto'
 *   canonicalOrder: Array,    // refined canonical order v1 = S, v2 = W, ..., vn = N
 *   rel: object|null,         // { canonicalOrder, number, edges, red, blue, poles }
 *   relProblems: string[],    // why no REL exists (not PTP, no 4-vertex outer face, ...)
 *   relValid: boolean,
 *   problems: string[],       // input problems; if non-empty nothing was laid out
 *   valid: boolean,           // input is usable
 *   layoutProblems: string[], // geometry doesn't match the graph
 *   layoutValid: boolean      // rectangles form a correct contact representation
 * }}
 */
function createContactRepresentation(graph, options = {}) {
  const { relation } = options;
  const poles = options.poles || (graph && graph.poles) || null;
  const empty = {
    rectangles: {},
    layoutSize: null,
    contacts: [],
    adjacency: new Map(),
    rotationSource: null,
    traversalOrder: [],
    poles: null,
    polesSource: null,
    canonicalOrder: [],
    rel: null,
    relProblems: [],
    relValid: false,
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

  const { rotation: orderedAdjacency, source: rotationSource, problems: rotationProblems } = buildRotation(adjacency, graph);
  if (rotationProblems.length) return { ...empty, adjacency, problems: rotationProblems };

  const relResult = RelApi.computeRegularEdgeLabeling({
    rotation: orderedAdjacency,
    vertices: graph.vertices,
    edges: graph.edges,
    poles
  });
  const polesSource = relResult.polesSource === 'given' && !options.poles ? 'xml' : relResult.polesSource;

  const traversalOrder = buildTraversalOrder(orderedAdjacency);
  const rel = relation || relResult.rel;
  let rectangles = {}, layoutSize = null, contacts = [], layoutProblems;
  if (!rel) {
    layoutProblems = ['No rectangular dual without a REL (see relProblems).'];
  } else {
    try {
      const dual = rectangularDual(rel);
      rectangles = dual.rectangles;
      layoutSize = { width: dual.width, height: dual.height };
      ({ contacts, problems: layoutProblems } = buildContacts(graph.edges, rectangles, orderedAdjacency));
    } catch (error) {
      layoutProblems = [error.message];
    }
  }

  return {
    rectangles,
    layoutSize,
    contacts,
    adjacency: orderedAdjacency,
    rotationSource,
    traversalOrder,
    poles: relResult.poles,
    polesSource,
    canonicalOrder: relResult.rel ? relResult.rel.canonicalOrder : [],
    rel: relResult.rel,
    relProblems: relResult.problems,
    relValid: relResult.rel !== null,
    problems: [],
    valid: true,
    layoutProblems,
    layoutValid: layoutProblems.length === 0
  };
}

// Convenience: XML text (e.g. planer-rep.xml) straight to the result above.
function createContactRepresentationFromXML(xmlText, options = {}) {
  const { graph, problems } = XmlApi.parsePlanarGraphXML(xmlText);
  if (!graph || problems.length) {
    return { ...createContactRepresentation(null), problems: problems.length ? problems : ['Could not read XML.'] };
  }
  return createContactRepresentation(graph, options);
}

const contactRepresentationAPI = {
  createContactRepresentation,
  createContactRepresentationFromXML,
  validateGraph,
  buildAdjacency,
  validateRotationSystem,
  orderAdjacencyByRotation,
  buildRotation,
  buildTraversalOrder,
  validateConnectivity,
  validatePoles,
  placeRectangles,
  rectangularDual,
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