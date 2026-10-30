
// ---------- Contact representation scaffold ----------
// ---------- Graph input follows: vertices [{ id, x, y }] and edges [{ id, from, to }].

function buildAdjacency(graph) {
  const adjacency = new Map();
  for (const vertex of graph.vertices || []) {
    adjacency.set(vertex.id, []);
  }

  for (const edge of graph.edges || []) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from).push(edge.to);
    adjacency.get(edge.to).push(edge.from);
  }

  return adjacency;
}

function computeSTOrdering(adjacency, outerEdgeOrPoles, relation) {
  const order = [];
  const seen = new Set();

  const keys = Array.from(adjacency.keys());
  for (const id of keys) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }

  if (outerEdgeOrPoles && Array.isArray(outerEdgeOrPoles)) {
    return outerEdgeOrPoles.map((entry) => entry.id || entry);
  }

  if (outerEdgeOrPoles && typeof outerEdgeOrPoles === 'object' && !Array.isArray(outerEdgeOrPoles)) {
    return keys.filter((id) => id in outerEdgeOrPoles || id === 'N' || id === 'E' || id === 'S' || id === 'W').concat(
      keys.filter((id) => !(id === 'N' || id === 'E' || id === 'S' || id === 'W'))
    );
  }

  return order;
}

function validateInput(graph, adjacency, order) {
  const problems = [];

  if (!graph || !Array.isArray(graph.vertices) || graph.vertices.length === 0) {
    problems.push('Graph must include at least one vertex.');
  }

  if (!graph || !Array.isArray(graph.edges)) {
    problems.push('Graph must include an edge array.');
  }

  for (const vertex of graph?.vertices || []) {
    if (!adjacency.has(vertex.id)) {
      problems.push(`Vertex '${vertex.id}' is missing from the adjacency map.`);
    }
  }

  for (const edge of graph?.edges || []) {
    if (!adjacency.has(edge.from)) {
      problems.push(`Edge '${edge.id || edge.from + '-' + edge.to}' references unknown source '${edge.from}'.`);
    }
    if (!adjacency.has(edge.to)) {
      problems.push(`Edge '${edge.id || edge.from + '-' + edge.to}' references unknown target '${edge.to}'.`);
    }
    if (edge.from === edge.to) {
      problems.push(`Self-loop edge '${edge.id || edge.from}' is not valid for this layout.`);
    }
  }

  if (order.length !== new Set(order).size) {
    problems.push('Ordering contains duplicate vertices.');
  }

  return { valid: problems.length === 0, problems };
}

function placeRectangles(order, adjacency) {
  const rectangles = {};
  const spacing = 52;

  order.forEach((vertexId, index) => {
    const x = 20 + (index % 8) * spacing;
    const y = 20 + Math.floor(index / 8) * spacing;
    rectangles[vertexId] = {
      id: vertexId,
      x,
      y,
      width: 40,
      height: 40,
      neighbors: adjacency.get(vertexId) || []
    };
  });

  return rectangles;
}

function buildContacts(edges, rectangles) {
  const contacts = [];

  for (const edge of edges || []) {
    const fromRect = rectangles[edge.from];
    const toRect = rectangles[edge.to];

    if (!fromRect || !toRect) continue;

    contacts.push({
      id: edge.id || `${edge.from}-${edge.to}`,
      from: edge.from,
      to: edge.to,
      fromRect: fromRect.id,
      toRect: toRect.id,
      side: 'shared'
    });
  }

  return contacts;
}

function createContactRepresentation(graph, outerEdgeOrPoles, relation) {
  const adjacency = buildAdjacency(graph);
  const order = computeSTOrdering(adjacency, outerEdgeOrPoles, relation);
  const validation = validateInput(graph, adjacency, order);
  const rectangles = placeRectangles(order, adjacency);
  const contacts = buildContacts(graph.edges || [], rectangles);

  return {
    rectangles,
    contacts,
    order,
    problems: validation.problems,
    valid: validation.valid
  };
}

module.exports = { createContactRepresentation, buildAdjacency, computeSTOrdering, validateInput, placeRectangles, buildContacts };
