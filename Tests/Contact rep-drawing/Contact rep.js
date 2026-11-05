// ---------- Square contact representation ----------
// Vertex coordinates are square centers in screen space (x right, y down).

const XmlApi = typeof require === 'function' ? require('./PlanarXML.js') : window.PlanarXML;
const EPS = 1e-9;
const DEFAULT_SQUARE_SIZE = 40;

function edgeLabel(edge) {
  return edge.id != null ? String(edge.id) : `${edge.from}-${edge.to}`;
}

function edgeKey(a, b) {
  const [p, q] = [String(a), String(b)].sort();
  return `${p}\u0000${q}`;
}

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
    if (!vertex || vertex.id == null) {
      problems.push('Every vertex needs an id.');
      continue;
    }
    if (vertexIds.has(vertex.id)) problems.push(`Duplicate vertex id '${vertex.id}'.`);
    vertexIds.add(vertex.id);
    if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)) {
      problems.push(`Vertex '${vertex.id}' needs numeric x and y coordinates.`);
    }
  }

  const seenEdges = new Map();
  const seenEdgeIds = new Set();
  for (const edge of Array.isArray(graph.edges) ? graph.edges : []) {
    if (!edge) {
      problems.push('Edge list contains an empty entry.');
      continue;
    }
    const label = edgeLabel(edge);
    if (edge.id != null) {
      if (seenEdgeIds.has(edge.id)) problems.push(`Duplicate edge id '${edge.id}'.`);
      seenEdgeIds.add(edge.id);
    }
    if (!vertexIds.has(edge.from)) problems.push(`Edge '${label}' references unknown source '${edge.from}'.`);
    if (!vertexIds.has(edge.to)) problems.push(`Edge '${label}' references unknown target '${edge.to}'.`);
    if (edge.from === edge.to) {
      problems.push(`Self-loop edge '${label}' is not valid for a square contact representation.`);
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

function buildAdjacency(graph) {
  const neighbors = new Map(graph.vertices.map((vertex) => [vertex.id, new Set()]));
  for (const edge of graph.edges) {
    neighbors.get(edge.from).add(edge.to);
    neighbors.get(edge.to).add(edge.from);
  }
  return new Map([...neighbors].map(([id, set]) => [id, [...set]]));
}

function buildTraversalOrder(adjacency) {
  const order = [];
  const seen = new Set();
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift();
      order.push(current);
      for (const neighbor of adjacency.get(current)) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }
  return order;
}

// Each edge constrains the sum of its endpoint side lengths to twice the center
// distance. Components are solved by propagation; odd cycles fix the free size.
function inferSquareSizes(vertices, edges, adjacency) {
  const byId = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const edgeWeights = new Map();
  const edgeLabels = new Map();
  const problems = [];

  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    const dx = Math.abs(from.x - to.x);
    const dy = Math.abs(from.y - to.y);
    if ((dx < EPS) === (dy < EPS)) {
      problems.push(`Edge '${edgeLabel(edge)}' must have distinct centers on the same row or column.`);
      continue;
    }
    const key = edgeKey(edge.from, edge.to);
    edgeWeights.set(key, 2 * (dx + dy));
    edgeLabels.set(key, edgeLabel(edge));
  }
  if (problems.length) return { sizes: new Map(), problems };

  const signs = new Map();
  const offsets = new Map();
  const visited = new Set();
  const sizes = new Map();

  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    if (adjacency.get(start).length === 0) {
      visited.add(start);
      sizes.set(start, DEFAULT_SQUARE_SIZE);
      continue;
    }

    signs.set(start, 1);
    offsets.set(start, 0);
    visited.add(start);
    const queue = [start];
    const component = [];
    let fixedParameter = null;

    while (queue.length) {
      const id = queue.shift();
      component.push(id);
      for (const neighbor of adjacency.get(id)) {
        const key = edgeKey(id, neighbor);
        const weight = edgeWeights.get(key);
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          signs.set(neighbor, -signs.get(id));
          offsets.set(neighbor, weight - offsets.get(id));
          queue.push(neighbor);
          continue;
        }

        const coefficient = signs.get(id) + signs.get(neighbor);
        const remainder = weight - offsets.get(id) - offsets.get(neighbor);
        if (coefficient === 0) {
          if (Math.abs(remainder) > EPS) {
            problems.push(`Square sizes cannot satisfy edge '${edgeLabels.get(key)}'.`);
          }
          continue;
        }

        const parameter = remainder / coefficient;
        if (fixedParameter !== null && Math.abs(fixedParameter - parameter) > EPS) {
          problems.push(`Square sizes give inconsistent contacts in the component containing '${start}'.`);
        } else {
          fixedParameter = parameter;
        }
      }
    }

    if (problems.length) return { sizes: new Map(), problems };

    let lower = -Infinity;
    let upper = Infinity;
    for (const id of component) {
      if (signs.get(id) > 0) lower = Math.max(lower, EPS - offsets.get(id));
      else upper = Math.min(upper, offsets.get(id) - EPS);
    }

    if (fixedParameter === null) {
      if (!(lower < upper)) {
        problems.push(`No positive square sizes satisfy the contacts in the component containing '${start}'.`);
        return { sizes: new Map(), problems };
      }
      if (Number.isFinite(lower) && Number.isFinite(upper)) fixedParameter = (lower + upper) / 2;
      else if (Number.isFinite(lower)) fixedParameter = lower + Math.max(1, Math.abs(lower) * 0.1);
      else if (Number.isFinite(upper)) fixedParameter = upper - Math.max(1, Math.abs(upper) * 0.1);
      else fixedParameter = DEFAULT_SQUARE_SIZE;
    }

    for (const id of component) {
      const size = signs.get(id) * fixedParameter + offsets.get(id);
      if (!Number.isFinite(size) || size <= EPS) {
        problems.push(`No positive square sizes satisfy the contacts in the component containing '${start}'.`);
        return { sizes: new Map(), problems };
      }
      sizes.set(id, size);
    }
  }
  return { sizes, problems };
}

function placeSquares(vertices, sizes) {
  const squares = {};
  for (const vertex of vertices) {
    const size = sizes.get(vertex.id);
    squares[vertex.id] = {
      id: vertex.id,
      x: vertex.x - size / 2,
      y: vertex.y - size / 2,
      width: size,
      height: size
    };
  }
  return squares;
}

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
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > EPS &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > EPS;
}

function buildContacts(edges, squares, adjacency) {
  const contacts = [];
  const problems = [];
  for (const edge of edges) {
    const contact = computeContact(squares[edge.from], squares[edge.to]);
    if (contact) contacts.push({ id: edgeLabel(edge), from: edge.from, to: edge.to, ...contact });
    else problems.push(`Edge '${edgeLabel(edge)}' does not produce a shared square side.`);
  }

  const ids = Object.keys(squares);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = squares[ids[i]];
      const b = squares[ids[j]];
      if (interiorsOverlap(a, b)) {
        problems.push(`Squares '${a.id}' and '${b.id}' overlap.`);
      } else if (!adjacency.get(a.id).includes(b.id) && computeContact(a, b)) {
        problems.push(`Squares '${a.id}' and '${b.id}' touch but their vertices are not adjacent.`);
      }
    }
  }
  return { contacts, problems };
}

function createContactRepresentation(graph) {
  const empty = {
    squares: {},
    rectangles: {},
    contacts: [],
    squareSizes: {},
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
  const traversalOrder = buildTraversalOrder(adjacency);
  const { sizes, problems: sizeProblems } = inferSquareSizes(graph.vertices, graph.edges, adjacency);
  if (sizeProblems.length) {
    return { ...empty, adjacency, traversalOrder, valid: true, layoutProblems: sizeProblems };
  }

  const squares = placeSquares(graph.vertices, sizes);
  const { contacts, problems: layoutProblems } = buildContacts(graph.edges, squares, adjacency);
  const squareSizes = Object.fromEntries(sizes);
  return {
    squares,
    rectangles: squares,
    contacts,
    squareSizes,
    adjacency,
    traversalOrder,
    problems: [],
    valid: true,
    layoutProblems,
    layoutValid: layoutProblems.length === 0
  };
}

function createContactRepresentationFromXML(xmlText) {
  const { graph, problems } = XmlApi.parsePlanarGraphXML(xmlText);
  if (!graph || problems.length) {
    return { ...createContactRepresentation(null), problems: problems.length ? problems : ['Could not read XML.'] };
  }
  return createContactRepresentation(graph);
}

const contactRepresentationAPI = {
  createContactRepresentation,
  createContactRepresentationFromXML,
  validateGraph,
  buildAdjacency,
  buildTraversalOrder,
  inferSquareSizes,
  placeSquares,
  computeContact,
  buildContacts
};

if (typeof module !== 'undefined' && module.exports) module.exports = contactRepresentationAPI;
if (typeof window !== 'undefined') window.ContactRepresentation = contactRepresentationAPI;
