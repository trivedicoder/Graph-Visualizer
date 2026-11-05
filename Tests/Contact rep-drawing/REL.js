// ---------- Planar embedding -> refined canonical order -> regular edge labeling ----------
//
// Everything here works on a ROTATION SYSTEM: Map<vertexId, neighborId[]>, where each
// list is the circular order of that vertex's neighbors (the planar embedding).
//
// Pipeline (Lecture 9, Kindermann "Visualization of Graphs", Parts IV-V):
//   1. rotationFromCoordinates  - polar ordering: sort neighbors by angle (if no XML rotation)
//   2. traceFaces               - walk the faces of the embedding
//   3. detectPoles / normalize  - find v_N, v_E, v_S, v_W and fix the orientation
//   4. checkPTP                 - properly triangulated planar graph? (Euler, faces, separating triangles)
//   5. refinedCanonicalOrder    - v1 = v_S, v2 = v_W, ..., vn = v_N   (slide 16)
//   6. colorEdges               - left/right/base edges -> red/blue    (slide 18)
//   7. validateREL              - independent check of the REL definition (slide 14)
//
// Orientation convention used internally ("normalized"):
//   lists are CLOCKWISE in a picture where v_N is on top, v_E right, v_S bottom, v_W left.
//   In that orientation the outer face reads N -> E -> S -> W, and at every inner vertex the
//   clockwise order of edges is: red in, blue out, red out, blue in.
// Input may be clockwise in screen space (y down, as the editor exports) or in math space
// (y up); normalizeOrientation() detects which one from the poles and flips if needed.

(function (root) {
  'use strict';

  const SIDES = ['north', 'east', 'south', 'west'];

  // ---------- small helpers ----------

  function pairKey(a, b) {
    const [p, q] = [String(a), String(b)].sort();
    return `${p}\u0000${q}`;
  }

  function dartKey(a, b) {
    return `${String(a)}\u0000${String(b)}`;
  }

  function label(id) {
    return `'${id}'`;
  }

  // Position of every neighbor inside its vertex's circular list, for O(1) "next".
  function indexRotation(rotation) {
    const index = new Map();
    for (const [v, list] of rotation) {
      const positions = new Map();
      list.forEach((u, i) => positions.set(u, i));
      index.set(v, positions);
    }
    return index;
  }

  // Neighbor that comes right after u in v's circular order.
  function nextAround(rotation, index, v, u) {
    const list = rotation.get(v);
    return list[(index.get(v).get(u) + 1) % list.length];
  }

  function reverseRotation(rotation) {
    return new Map([...rotation].map(([v, list]) => [v, [...list].reverse()]));
  }

  // Count edges by summing the degrees and dividing by 2. The rotation system must be consistent (every edge appears in both endpoints' lists).
  function countEdges(rotation) {
    let degreeSum = 0;
    for (const list of rotation.values()) degreeSum += list.length;
    return degreeSum / 2;
  }

  // ---------- 1. polar ordering ----------

  // Sort each neighbor list by the angle of the edge, measured with atan2.
  // Ascending atan2 in screen coordinates (y down) is clockwise on screen, which is the
  // same order Graph.toRotationSystem() writes into the XML.
  function rotationFromCoordinates(vertices, adjacency) { // vertices: {id, x, y}[], adjacency: Map<id, id[]>
    const byId = new Map(vertices.map((v) => [v.id, v]));
    const problems = [];
    const rotation = new Map();

    // Sort each vertex's neighbors by angle, and check for overlapping edges (same direction).
    for (const [id, neighbors] of adjacency) {
      const v = byId.get(id);
      const angle = (u) => Math.atan2(byId.get(u).y - v.y, byId.get(u).x - v.x);
      const sorted = [...neighbors].sort((a, b) => angle(a) - angle(b));

      // Two edges leaving in exactly the same direction overlap, so the order is undefined.
      for (let i = 0; sorted.length > 1 && i < sorted.length; i++) {
        const a = byId.get(sorted[i]);
        const b = byId.get(sorted[(i + 1) % sorted.length]);
        const ax = a.x - v.x, ay = a.y - v.y, bx = b.x - v.x, by = b.y - v.y;
        if (ax * by - ay * bx === 0 && ax * bx + ay * by > 0) {
          problems.push(`Edges ${label(id)}-${label(sorted[i])} and ${label(id)}-${label(sorted[(i + 1) % sorted.length])} overlap, so the circular order at ${label(id)} is undefined.`);
        }
      }
      rotation.set(id, sorted);
    }
    return { rotation, problems };
  }

  // ---------- 2. faces ----------

  // Face walk: arrive at v from u, leave towards the neighbor after u in v's order.
  // Every dart (directed edge) lies on exactly one face.
  function traceFaces(rotation) { // rotation: Map<id, id[]>
    const index = indexRotation(rotation);
    const seen = new Set();
    const faces = [];

    for (const [u, list] of rotation) {
      for (const v of list) {
        if (seen.has(dartKey(u, v))) continue;
        const face = [];
        let a = u, b = v;
        while (!seen.has(dartKey(a, b))) {
          seen.add(dartKey(a, b));
          face.push(a);
          const c = nextAround(rotation, index, b, a);
          a = b;
          b = c;
        }
        faces.push(face);
      }
    }
    return faces;
  }

  // Compute the signed area of a face (positive if counterclockwise, negative if clockwise).
  function signedArea(face, byId) {
    let sum = 0;
    for (let i = 0; i < face.length; i++) {
      const p = byId.get(face[i]);
      const q = byId.get(face[(i + 1) % face.length]);
      sum += p.x * q.y - q.x * p.y;
    }
    return sum / 2;
  }

  // ---------- 3. poles and orientation ----------

  // Without explicit poles: the outer face is the face with the largest area. It must be a
  // 4-cycle; its topmost vertex (smallest y, screen space) becomes v_N.
  function detectPoles(rotation, vertices) {
    const byId = new Map(vertices.map((v) => [v.id, v]));
    const faces = traceFaces(rotation);
    let outer = null, best = -1;
    for (const face of faces) {
      const area = Math.abs(signedArea(face, byId));
      if (area > best) { best = area; outer = face; }
    }
    if (!outer) return { poles: null, problems: ['Graph has no faces.'] };
    if (outer.length !== 4 || new Set(outer).size !== 4) {
      return {
        poles: null,
        problems: [`Outer face ${outer.map(label).join('-')} has ${outer.length} vertices; a rectangular dual needs exactly 4 (N, E, S, W).`]
      };
    }

    // Find the topmost vertex (smallest y, screen space) to determine the north pole.
    let i = 0;
    for (let j = 1; j < 4; j++) {
      const a = byId.get(outer[j]), b = byId.get(outer[i]);
      if (a.y < b.y || (a.y === b.y && a.x < b.x)) i = j;
    }

    // The outer face is a 4-cycle, so the poles are the vertices in clockwise order starting from the topmost vertex.
    const north = outer[i];
    const south = outer[(i + 2) % 4];
    const p = outer[(i + 1) % 4], q = outer[(i + 3) % 4];
    const [east, west] = byId.get(p).x >= byId.get(q).x ? [p, q] : [q, p];
    return { poles: { north, east, south, west }, problems: [] };
  }

  // Make the lists clockwise with N on top: at every pole P, the neighbor after the previous
  // pole (in N,E,S,W order) must be the next pole. If the opposite holds, reverse every list.
  function normalizeOrientation(rotation, poles) {
    const problems = [];
    const index = indexRotation(rotation);
    const ring = SIDES.map((s) => poles[s]);

    // Check that the outer face is N-E-S-W in clockwise order, and that every outer edge exists.
    for (let i = 0; i < 4; i++) {
      const a = ring[i], b = ring[(i + 1) % 4];
      if (!index.get(a).has(b)) problems.push(`Outer edge ${label(a)}-${label(b)} (${SIDES[i]}-${SIDES[(i + 1) % 4]}) is missing.`);
    }
    if (problems.length) return { rotation: null, flipped: false, problems };

    // Check the orientation of the outer face: clockwise or counterclockwise. If both occur, the embedding is invalid.
    let clockwise = 0, counter = 0;
    for (let i = 0; i < 4; i++) {
      const prev = ring[(i + 3) % 4], pole = ring[i], next = ring[(i + 1) % 4]; // prev -> pole -> next in clockwise order
      if (rotation.get(pole).length < 3) continue; // degree 2 cannot tell the two apart
      if (nextAround(rotation, index, pole, prev) === next) clockwise++;
      if (nextAround(rotation, index, pole, next) === prev) counter++;
    }

    // If the outer face is clockwise, return the rotation as-is. If it is counterclockwise, reverse every list. If both occur, the embedding is invalid.
    if (clockwise > 0 && counter === 0) return { rotation, flipped: false, problems };
    if (counter > 0 && clockwise === 0) return { rotation: reverseRotation(rotation), flipped: true, problems };
    return {
      rotation: null,
      flipped: false,
      problems: ['Poles N, E, S, W do not bound one face in cyclic order; check the pole selection.']
    };
  }

  // ---------- 4. PTP check ----------

  // Properly triangulated planar graph (slide 13): every inner face is a triangle, the outer
  // face is N-E-S-W, and there is no separating triangle.
  function checkPTP(rotation, poles) {
    const problems = [];
    const n = rotation.size;
    const m = countEdges(rotation);
    if (n < 5) problems.push(`Need at least one vertex inside N-E-S-W (graph has ${n} vertices).`);

    const faces = traceFaces(rotation);
    if (n - m + faces.length !== 2) {
      problems.push(`Embedding is not planar: V - E + F = ${n} - ${m} + ${faces.length} = ${n - m + faces.length}, expected 2. Some edges probably cross.`);
      return problems;
    }

    // Normalized orientation: the outer face is the one containing the dart N -> E.
    const outerKey = dartKey(poles.north, poles.east);
    const faceKeys = new Set();
    for (const face of faces) {
      const darts = face.map((v, i) => dartKey(v, face[(i + 1) % face.length]));
      if (darts.includes(outerKey)) {
        const ring = SIDES.map((s) => poles[s]);
        const start = face.indexOf(poles.north);
        const rotated = face.slice(start).concat(face.slice(0, start));
        if (rotated.length !== 4 || rotated.some((v, i) => v !== ring[i])) {
          problems.push(`Outer face is ${face.map(label).join('-')}; it must be exactly N-E-S-W.`);
        }
        continue;
      }
      if (face.length !== 3) {
        problems.push(`Inner face ${face.map(label).join('-')} is not a triangle; add a diagonal.`);
      } else {
        faceKeys.add([...face].map(String).sort().join('\u0000'));
      }
    }

    // Every triangle of the graph must be a face; otherwise it separates inside from outside.
    const neighborSets = new Map([...rotation].map(([v, list]) => [v, new Set(list)]));
    const order = new Map([...rotation.keys()].map((v, i) => [v, i]));
    for (const [u, list] of rotation) {
      for (const v of list) {
        if (order.get(v) <= order.get(u)) continue;
        for (const w of list) {
          if (order.get(w) <= order.get(v) || !neighborSets.get(v).has(w)) continue;
          if (!faceKeys.has([u, v, w].map(String).sort().join('\u0000'))) {
            problems.push(`Triangle ${label(u)}-${label(v)}-${label(w)} is a separating triangle (it is not a face).`);
          }
        }
      }
    }
    return problems;
  }

  // ---------- 5. refined canonical order (slide 16) ----------

  // Peel vertices off the top: v_n = N first, then repeatedly remove an outer vertex v_k
  // such that
  //   (a) G_{k-1} = G_k - v_k is biconnected and its boundary still contains (v_S, v_W),
  //   (b) v_k's neighbors in G_{k-1} form an interval (>= 2 vertices) of the path
  //       C_{k-1} \ (v_S, v_W), which runs from v_W (left) over the top to v_S (right),
  //   (c) if k <= n - 2, v_k has at least 2 neighbors that were already removed.
  function refinedCanonicalOrder(rotation, poles) {
    const { north: N, south: S, west: W } = poles;
    const n = rotation.size;
    const index = indexRotation(rotation);
    const alive = new Set(rotation.keys());
    const removedNeighbors = new Map([...rotation.keys()].map((v) => [v, 0]));
    const peeled = []; // v_n, v_{n-1}, ...

    // Next alive neighbor after u around v.
    function nextAlive(v, u) {
      const list = rotation.get(v);
      let i = index.get(v).get(u);
      for (let step = 0; step < list.length; step++) {
        i = (i + 1) % list.length;
        if (alive.has(list[i])) return list[i];
      }
      return u;
    }

    // Outer boundary of the alive subgraph as the path W ... S, or null if it is not a
    // simple cycle (then the subgraph is not biconnected).
    function boundaryPath() {
      const seq = [S];
      const visited = new Set([S]);
      let a = S, b = W;
      for (let steps = 0; steps <= 2 * alive.size + 2; steps++) {
        if (b === S) return nextAlive(S, a) === W ? seq.slice(1).concat([S]) : null;
        if (visited.has(b)) return null;
        visited.add(b);
        seq.push(b);
        const c = nextAlive(b, a);
        a = b;
        b = c;
      }
      return null;
    }

    function connected() {
      const [start] = alive;
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length) {
        const v = queue.pop();
        for (const u of rotation.get(v)) {
          if (alive.has(u) && !seen.has(u)) { seen.add(u); queue.push(u); }
        }
      }
      return seen.size === alive.size;
    }

    function canRemove(v) {
      alive.delete(v);
      const path = boundaryPath();
      let ok = path !== null && connected();
      if (ok) {
        const positions = rotation.get(v)
          .filter((u) => alive.has(u))
          .map((u) => path.indexOf(u))
          .sort((x, y) => x - y);
        ok = positions.length >= 2 && positions[0] >= 0 &&
          positions.every((p, i) => i === 0 || p === positions[i - 1] + 1);
      }
      alive.add(v);
      return ok;
    }

    function remove(v) {
      alive.delete(v);
      peeled.push(v);
      for (const u of rotation.get(v)) removedNeighbors.set(u, removedNeighbors.get(u) + 1);
    }

    if (!canRemove(N)) throw new Error(`v_n = N ${label(N)} does not satisfy the canonical-order conditions.`);
    remove(N);
    // v_{n-1} = E (as in the lecture's example): every later v_k then needs two removed
    // neighbors, and starting from the N-E corner guarantees one is always available.
    if (!canRemove(poles.east)) throw new Error(`v_(n-1) = E ${label(poles.east)} does not satisfy the canonical-order conditions.`);
    remove(poles.east);

    for (let k = n - 2; k >= 4; k--) {
      const path = boundaryPath();
      let chosen = null;
      for (const v of path) {
        if (v === S || v === W) continue;
        if (k <= n - 2 && removedNeighbors.get(v) < 2) continue;
        if (canRemove(v)) { chosen = v; break; }
      }
      if (chosen === null) throw new Error(`No valid choice for v_${k}; boundary is ${path.map(label).join(' ')}.`);
      remove(chosen);
    }

    const rest = [...alive].filter((v) => v !== S && v !== W);
    if (rest.length !== 1) throw new Error('Canonical order did not end with the triangle v_S, v_W, v_3.');
    return [S, W, rest[0], ...peeled.reverse()];
  }

  // ---------- 6. coloring (slide 18) ----------

  // Split v's circular order into higher neighbors v_k1..v_ko (left to right) and lower
  // neighbors v_t1..v_tl (left to right). Clockwise around v_k it reads k1..ko, tl..t1.
  function splitNeighbors(rotation, number, poles, v) {
    const list = rotation.get(v);
    const k = number.get(v);
    const isHigher = (u) => number.get(u) > k;
    const anyHigher = list.some(isHigher);
    const anyLower = list.some((u) => !isHigher(u));

    let start;
    if (anyHigher && anyLower) {
      start = list.findIndex((u, i) => isHigher(u) && !isHigher(list[(i - 1 + list.length) % list.length]));
    } else if (v === poles.south) {
      start = list.indexOf(poles.west);   // v_1: k1 = W ... ko = E
    } else if (v === poles.north) {
      start = list.indexOf(poles.east);   // v_n: clockwise from E is tl = E ... t1 = W
    } else {
      throw new Error(`Vertex ${label(v)} has no ${anyHigher ? 'lower' : 'higher'} neighbors.`);
    }

    const seq = list.slice(start).concat(list.slice(0, start));
    const higher = seq.filter(isHigher);
    const lower = seq.filter((u) => !isHigher(u)).reverse();
    if (seq.slice(0, higher.length).some((u) => !isHigher(u))) {
      throw new Error(`Higher neighbors of ${label(v)} are not consecutive in its circular order.`);
    }
    return { higher, lower };
  }

  function colorEdges(rotation, poles, canonicalOrder, edges) {
    const number = new Map(canonicalOrder.map((v, i) => [v, i + 1]));
    const split = new Map([...rotation.keys()].map((v) => [v, splitNeighbors(rotation, number, poles, v)]));
    const ring = SIDES.map((s) => poles[s]);
    const outerKeys = new Set(ring.map((p, i) => pairKey(p, ring[(i + 1) % 4])));

    return edges.map((edge) => {
      const id = edge.id != null ? edge.id : `${edge.from}-${edge.to}`;
      if (outerKeys.has(pairKey(edge.from, edge.to))) {
        return { id, from: edge.from, to: edge.to, color: null, kind: 'outer' };
      }
      // Orient from lower to higher canonical number.
      const [u, w] = number.get(edge.from) < number.get(edge.to) ? [edge.from, edge.to] : [edge.to, edge.from];
      const up = split.get(u).higher;
      const down = split.get(w).lower;

      if (up[0] === w) return { id, from: u, to: w, color: 'blue', kind: 'left' };
      if (up[up.length - 1] === w) return { id, from: u, to: w, color: 'red', kind: 'right' };

      const base = down.reduce((lo, x) => (number.get(x) < number.get(lo) ? x : lo));
      if (base !== u) throw new Error(`Edge ${label(u)}-${label(w)} is neither a left, right, nor base edge.`);
      const a = down.indexOf(u);
      const color = a === 0 ? 'red' : 'blue'; // i = 1 -> red, i = l -> blue, otherwise free (blue)
      return { id, from: u, to: w, color, kind: 'base' };
    });
  }

  // ---------- 7. REL validation (slide 14) ----------

  function validateREL(rotation, poles, coloredEdges) {
    const problems = [];
    const byPair = new Map(coloredEdges.map((e) => [pairKey(e.from, e.to), e]));
    const required = new Map([
      [poles.north, 'blue-in'],
      [poles.south, 'blue-out'],
      [poles.west, 'red-out'],
      [poles.east, 'red-in']
    ]);
    const pattern = ['red-in', 'blue-out', 'red-out', 'blue-in'];

    for (const [v, list] of rotation) {
      const labels = [];
      for (const u of list) {
        const e = byPair.get(pairKey(v, u));
        if (!e) { problems.push(`Edge ${label(v)}-${label(u)} has no color.`); continue; }
        if (e.kind === 'outer') continue;
        labels.push(`${e.color}-${e.from === v ? 'out' : 'in'}`);
      }

      if (required.has(v)) {
        const bad = labels.filter((l) => l !== required.get(v));
        if (bad.length) problems.push(`Pole ${label(v)}: every inner edge must be ${required.get(v)}, found ${bad.join(', ')}.`);
        continue;
      }

      // Inner vertex: cyclic runs must be exactly red-in, blue-out, red-out, blue-in.
      const change = labels.findIndex((l, i) => l !== labels[(i - 1 + labels.length) % labels.length]);
      const runs = [];
      if (change >= 0) {
        const seq = labels.slice(change).concat(labels.slice(0, change));
        for (const l of seq) if (runs[runs.length - 1] !== l) runs.push(l);
      }
      const start = runs.indexOf('red-in');
      const rotated = start >= 0 ? runs.slice(start).concat(runs.slice(0, start)) : runs;
      if (rotated.length !== 4 || rotated.some((l, i) => l !== pattern[i])) {
        problems.push(`Vertex ${label(v)}: clockwise edge order is [${labels.join(', ')}], expected blocks red-in, blue-out, red-out, blue-in.`);
      }
    }
    return problems;
  }

  // ---------- all together ----------

  /**
   * @param {object} input
   * @param {Map}    input.rotation  Map<id, neighborId[]> circular orders (clockwise either way)
   * @param {Array}  input.vertices  [{ id, x, y }]  (only used to auto-detect poles)
   * @param {Array}  input.edges     [{ id?, from, to }]
   * @param {object} [input.poles]   { north, east, south, west }; detected if omitted
   * @returns {{ rel: object|null, poles: object|null, polesSource: string|null, problems: string[] }}
   */
  function computeRegularEdgeLabeling({ rotation, vertices, edges, poles }) {
    let polesSource = 'given';
    if (!poles) {
      const detected = detectPoles(rotation, vertices);
      if (detected.problems.length) return { rel: null, poles: null, polesSource: null, problems: detected.problems };
      poles = detected.poles;
      polesSource = 'auto';
    }

    const normalized = normalizeOrientation(rotation, poles);
    if (normalized.problems.length) return { rel: null, poles, polesSource, problems: normalized.problems };

    const ptpProblems = checkPTP(normalized.rotation, poles);
    if (ptpProblems.length) return { rel: null, poles, polesSource, problems: ptpProblems };

    let canonicalOrder, colored;
    try {
      canonicalOrder = refinedCanonicalOrder(normalized.rotation, poles);
      colored = colorEdges(normalized.rotation, poles, canonicalOrder, edges);
    } catch (error) {
      return { rel: null, poles, polesSource, problems: [error.message] };
    }

    const relProblems = validateREL(normalized.rotation, poles, colored);
    if (relProblems.length) return { rel: null, poles, polesSource, problems: relProblems };

    const inner = colored.filter((e) => e.kind !== 'outer');
    return {
      rel: {
        poles,
        canonicalOrder,
        number: Object.fromEntries(canonicalOrder.map((v, i) => [v, i + 1])),
        edges: colored,
        red: inner.filter((e) => e.color === 'red'),   // T_r: west -> east
        blue: inner.filter((e) => e.color === 'blue'), // T_b: south -> north
        rotation: normalized.rotation,                  // clockwise with N on top (for the dual)
        flipped: normalized.flipped
      },
      poles,
      polesSource,
      problems: []
    };
  }

  const PlanarREL = {
    rotationFromCoordinates,
    traceFaces,
    detectPoles,
    normalizeOrientation,
    checkPTP,
    refinedCanonicalOrder,
    splitNeighbors,
    colorEdges,
    validateREL,
    computeRegularEdgeLabeling
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PlanarREL;
  if (typeof root !== 'undefined' && root) root.PlanarREL = PlanarREL;
})(typeof window !== 'undefined' ? window : undefined);
