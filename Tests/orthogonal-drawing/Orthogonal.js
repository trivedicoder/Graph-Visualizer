

// ---------- small doubly linked list, so we can insert before/after a
// ---------- vertex in O(1) while building the ordering ----------
class LinkedList {
  constructor() {
    this.head = null;
    this.tail = null;
  }
  insertFirst(value) {
    const node = { value, prev: null, next: null };
    this.head = node;
    this.tail = node;
    return node;
  }
  insertAfter(node, value) {
    const newNode = { value, prev: node, next: node.next };
    if (node.next) node.next.prev = newNode;
    else this.tail = newNode;
    node.next = newNode;
    return newNode;
  }
  insertBefore(node, value) {
    const newNode = { value, prev: node.prev, next: node };
    if (node.prev) node.prev.next = newNode;
    else this.head = newNode;
    node.prev = newNode;
    return newNode;
  }
  toArray() {
    const arr = [];
    let n = this.head;
    while (n) {
      arr.push(n.value);
      n = n.next;
    }
    return arr;
  }
}

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// adjacency: Map<vertexId, Array<vertexId>>  (undirected, simple graph)
// s, t: the two endpoints of an edge on the outer face
// Returns: array of vertex ids in st-order
function computeSTOrdering(adjacency, s, t) {
  const DFSnum = new Map();       // vertex -> dfs visit number
  const edgeSeen = new Set();     // edge keys already processed by dfs()
  const PARENT = new Map();       // vertex -> its dfs-tree parent
  const CHILDEDGE = new Map();    // vertex -> the tree edge to its current/last child
  const D = new Map();            // tree-edge key -> back-edge sources hanging off it

  const L = new LinkedList();
  const nodeOf = new Map();       // vertex -> its node in L, once placed

  let i = 0;
  const inL = (v) => nodeOf.has(v);

  function insertPathAfter(anchor, path) {
    // splice `path` (in given order) into L immediately after `anchor`
    let ref = nodeOf.get(anchor);
    for (const v of path) {
      const node = L.insertAfter(ref, v);
      nodeOf.set(v, node);
      ref = node;
    }
  }

  function currentPositions() {
    // O(n) scan of L to get each vertex's current index. Called once per
    // ear insertion; simple and correct, not the fastest possible.
    const pos = new Map();
    let idx = 0;
    let n = L.head;
    while (n) {
      pos.set(n.value, idx++);
      n = n.next;
    }
    return pos;
  }

  function processEars(w, x, treeKey) {
    const backSources = D.get(treeKey) || [];
    D.set(treeKey, []); // clear up front; recursion below may repopulate other keys

    for (const v of backSources) {
      // walk up parent pointers from v until we hit a vertex already placed in L
      let u = v;
      while (!inL(u)) u = PARENT.get(u);

      // build the tree path from (child of u) down to v, in root-to-v order
      const path = [];
      let cur = v;
      while (cur !== u) {
        path.push(cur);
        cur = PARENT.get(cur);
      }
      path.reverse();

      // Both u and w are already in L at this point (u by construction of
      // the walk above; w because it's either s/t, or a vertex placed by an
      // earlier call to processEars). The ear connects u and w through the
      // new interior vertices in `path`, closed by the back edge (v, w).
      // Splice `path` in on whichever side keeps the list consistent with
      // both anchors' current positions.
      const pos = currentPositions();
      let insertedPath;
      if (pos.get(u) < pos.get(w)) {
        // order so far: ... u ... w ...  =>  becomes ... u, path..., w ...
        insertPathAfter(u, path);
        insertedPath = path;
      } else {
        // order so far: ... w ... u ...  =>  becomes ... w, reverse(path)..., u ...
        const rev = [...path].reverse();
        insertPathAfter(w, rev);
        insertedPath = rev;
      }

      // recurse into any tree edges along the path we just inserted, but
      // only once their own child endpoint is confirmed to be in L -
      // mirrors the "if x in L" trigger used everywhere else.
      for (const pv of insertedPath) {
        const ce = CHILDEDGE.get(pv);
        if (ce && D.get(ce.key) && D.get(ce.key).length && inL(ce.w)) {
          processEars(pv, ce.w, ce.key);
        }
      }
    }
  }

  function dfs(v) {
    DFSnum.set(v, ++i);
    for (const w of adjacency.get(v) || []) {
      const ek = edgeKey(v, w);
      if (edgeSeen.has(ek)) continue;
      edgeSeen.add(ek);

      if (!DFSnum.has(w)) {
        // tree edge v -> w
        CHILDEDGE.set(v, { u: v, w, key: ek });
        PARENT.set(w, v);
        dfs(w);
      } else {
        // back edge v -> w, w already visited (an ancestor)
        const parentEdge = CHILDEDGE.get(w);
        if (parentEdge) {
          const treeKey = parentEdge.key;
          if (!D.has(treeKey)) D.set(treeKey, []);
          D.get(treeKey).push(v);
          if (inL(parentEdge.w)) {
            processEars(w, parentEdge.w, treeKey);
          }
        }
      }
    }
  }

  // --- init: place s and t first, matching "initialize L as {s, t}" ---
  DFSnum.set(s, ++i);
  const initKey = edgeKey(s, t);
  edgeSeen.add(initKey);
  CHILDEDGE.set(s, { u: s, w: t, key: initKey });

  const sNode = L.insertFirst(s);
  nodeOf.set(s, sNode);
  const tNode = L.insertAfter(sNode, t);
  nodeOf.set(t, tNode);

  dfs(t);

  return L.toArray();
}

// ---------- validator: checks the defining property of an st-ordering ----------
// Every vertex except the first and last must have at least one neighbour
// earlier in the order and one neighbour later.
function isValidSTOrdering(adjacency, order) {
  const pos = new Map(order.map((v, idx) => [v, idx]));
  for (let idx = 1; idx < order.length - 1; idx++) {
    const v = order[idx];
    const neighbours = adjacency.get(v) || [];
    const hasEarlier = neighbours.some((w) => pos.get(w) < idx);
    const hasLater = neighbours.some((w) => pos.get(w) > idx);
    if (!hasEarlier || !hasLater) {
      return { valid: false, failedAt: v, hasEarlier, hasLater };
    }
  }
  return { valid: true };
}

// ---------- helper to build adjacency from a plain edge list ----------
function buildAdjacency(edges) {
  const adjacency = new Map();
  for (const [a, b] of edges) {
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }
  return adjacency;
}

// ---------- test ----------
// Small biconnected graph: s-a, a-t, t-b, b-s, a-b
//
//     s---a
//     |  /|
//     b---t
//
function runTest() {
  const edges = [
    ["s", "a"],
    ["a", "t"],
    ["t", "b"],
    ["b", "s"],
    ["a", "b"],
  ];
  const adjacency = buildAdjacency(edges);

  const order = computeSTOrdering(adjacency, "s", "t");
  console.log("st-ordering:", order.join(", "));

  const result = isValidSTOrdering(adjacency, order);
  console.log("valid:", result.valid ? "yes" : `no (failed at ${result.failedAt})`);
}

runTest();

module.exports = { computeSTOrdering, isValidSTOrdering, buildAdjacency };