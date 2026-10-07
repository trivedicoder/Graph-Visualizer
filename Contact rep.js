
// ---------- Outline for converting a graph into a rectangle contact representation. ----------
// ---------- Graph input follows: vertices [{ id, x, y }] and edges [{ id, from, to }].

function createContactRepresentation(graph, outerEdge) {
  // 1. Build adjacency from the graph's vertices and edges.
  const adjacency = buildAdjacency(graph);

  // 2. Compute an st-ordering using the chosen outer-face edge.
  const order = computeSTOrdering(adjacency, outerEdge);

  // 3. Check the graph/order meet the contact-representation algorithm's requirements.
  validateInput(graph, adjacency, order);

  // 4. Process vertices in st-order and assign each vertex a rectangle.
  const rectangles = placeRectangles(order, adjacency);

  // 5. Turn each graph edge into a shared side between its two rectangles.
  const contacts = buildContacts(graph.edges, rectangles);

  // 6. Return layout data for later drawing in the graph visualizer.
  return { rectangles, contacts, order };
}

module.exports = { createContactRepresentation };
