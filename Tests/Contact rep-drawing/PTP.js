// ---------- PTP check (properly triangulated planar graph) ----------
//
// Checks the three conditions a graph needs before it can get a REL (Lecture 9, slide 13):
//   1. the outer face is exactly N-E-S-W
//   2. every inner face is a triangle
//   3. there is no separating triangle (every triangle of the graph is a face)
//
// This class does not depend on any other file. REL.js calls it from checkPTP().
//
// Input: a rotation system Map<vertexId, neighborId[]> that is CLOCKWISE with N on top
// (what REL.normalizeOrientation returns), and the poles { north, east, south, west }.
//
// Run it:
//   node PTP.js                     -> runs the built-in examples
//   node PTP.js planar-graph.xml    -> checks an XML exported from the editor
//
// Or in code:
//   new PTP(rotation, poles).check()     -> { valid, innerFaces, separating, problems }
//   PTP.fromGraph(graph).check()         -> same, starting from a graph object

  // ---------- 4. PTP check ----------

  // Properly triangulated planar graph (slide 13): every inner face is a triangle, the outer
  // face is N-E-S-W, and there is no separating triangle.
  

class PTP {

  constructor(rotation, poles) {
    this.rotation = rotation;
    this.poles = poles;
  }

  //______________________________ Helpers ______________________________

  static label(id) {
    return `'${id}'`;
  }

  // Same key for a group of vertices no matter their order.
  static key(ids) {
    return ids.map(String).sort().join('\u0000');
  }

  edgeCount() {
    let sum = 0;
    for (const list of this.rotation.values()) sum += list.length;
    return sum / 2;
  }

  //______________________________ Faces ______________________________

  // Face walk: arrive at v from u, leave towards the neighbor right after u in v's order.
  // Every dart (directed edge) is on exactly one face.
  faces() {
    const seen = new Set();
    const result = [];
    for (const [u, list] of this.rotation) {
      for (const v of list) {
        if (seen.has(u + '\u0000' + v)) continue;
        const face = [];
        let a = u, b = v;
        while (!seen.has(a + '\u0000' + b)) {
          seen.add(a + '\u0000' + b);
          face.push(a);
          const around = this.rotation.get(b);
          const c = around[(around.indexOf(a) + 1) % around.length];
          a = b;
          b = c;
        }
        result.push(face);
      }
    }
    return result;
  }

  // The outer face is the one that walks along the dart N -> E.
  isOuter(face) {
    const { north, east } = this.poles;
    return face.some((v, i) => v === north && face[(i + 1) % face.length] === east);
  }

  innerFaces() {
    return this.faces().filter((f) => !this.isOuter(f));
  }

  //______________________________ Triangles ______________________________

  // Every triangle u-v-w of the graph, each one found once.
  triangles() {
    const order = new Map([...this.rotation.keys()].map((v, i) => [v, i]));
    const neighborSets = new Map([...this.rotation].map(([v, list]) => [v, new Set(list)]));
    const result = [];
    for (const [u, list] of this.rotation) {
      for (const v of list) {
        if (order.get(v) <= order.get(u)) continue;
        for (const w of list) {
          if (order.get(w) <= order.get(v)) continue;
          if (neighborSets.get(v).has(w)) result.push([u, v, w]);
        }
      }
    }
    return result;
  }

  // Triangles that are not a face: they have vertices inside and outside.
  separatingTriangles() {
    const faceKeys = new Set(
      this.innerFaces().filter((f) => f.length === 3).map((f) => PTP.key(f))
    );
    return this.triangles().filter((t) => !faceKeys.has(PTP.key(t)));
  }

  //______________________________ The check ______________________________

  check() {
    const label = PTP.label;
    const report = { valid: false, innerFaces: [], separating: [], problems: [] };
    const n = this.rotation.size;
    const m = this.edgeCount();
    const faces = this.faces();

    if (n < 5) report.problems.push(`Need at least one vertex inside N-E-S-W (graph has ${n} vertices).`);
    if (n - m + faces.length !== 2) {
      report.problems.push(`Embedding is not planar: V - E + F = ${n} - ${m} + ${faces.length} = ${n - m + faces.length}, expected 2. Some edges probably cross.`);
      return report;
    }

    // 1. outer face is N-E-S-W
    const { north, east, south, west } = this.poles;
    const ring = [north, east, south, west];
    const outer = faces.find((f) => this.isOuter(f));
    const start = outer.indexOf(north);
    const rotated = outer.slice(start).concat(outer.slice(0, start));
    if (rotated.length !== 4 || rotated.some((v, i) => v !== ring[i])) {
      report.problems.push(`Outer face is ${outer.map(label).join('-')}; it must be exactly N-E-S-W.`);
    }

    // 2. inner faces are triangles
    report.innerFaces = faces.filter((f) => !this.isOuter(f));
    for (const f of report.innerFaces) {
      if (f.length !== 3) report.problems.push(`Inner face ${f.map(label).join('-')} is not a triangle; add a diagonal.`);
    }

    // 3. no separating triangles
    report.separating = this.separatingTriangles();
    for (const t of report.separating) {
      report.problems.push(`Triangle ${t.map(label).join('-')} is a separating triangle (it is not a face).`);
    }

    report.valid = report.problems.length === 0;
    return report;
  }

  //______________________________ Starting from a graph ______________________________

  // Builds the rotation and poles with REL.js, then makes a PTP.
  // REL.js is loaded here (not at the top) so the two files don't load each other at startup.
  // Returns { check: PTP } or { problems: [...] }.
  static fromGraph(graph, poles) {
    const REL = typeof require === 'function' ? require('./REL.js') : window.PlanarREL;

    // circular neighbor orders: XML rotation system if there is one, else sort by angle
    let rotation;
    const rotations = graph.embedding && graph.embedding.rotationSystem;
    if (Array.isArray(rotations)) {
      rotation = new Map(rotations.map((r) => [r.vertex, [...r.neighbors]]));
    } else {
      const adjacency = new Map(graph.vertices.map((v) => [v.id, []]));
      for (const e of graph.edges) {
        adjacency.get(e.from).push(e.to);
        adjacency.get(e.to).push(e.from);
      }
      const result = REL.rotationFromCoordinates(graph.vertices, adjacency);
      if (result.problems.length) return { problems: result.problems };
      rotation = result.rotation;
    }

    // poles: given, from the XML, or detected from the outer face
    poles = poles || graph.poles || null;
    if (!poles) {
      const detected = REL.detectPoles(rotation, graph.vertices);
      if (detected.problems.length) return { problems: detected.problems };
      poles = detected.poles;
    }

    // clockwise with N on top
    const normalized = REL.normalizeOrientation(rotation, poles);
    if (normalized.problems.length) return { problems: normalized.problems };
    return { check: new PTP(normalized.rotation, poles) };
  }

  // Readable summary for the terminal.
  static print(name, setup) {
    console.log(`\n=== ${name} ===`);
    if (!setup.check) {
      setup.problems.forEach((p) => console.log(`  ! ${p}`));
      console.log('Result: could not set up the check');
      return;
    }
    const report = setup.check.check();
    const p = setup.check.poles;
    console.log(`Poles: N=${p.north}  E=${p.east}  S=${p.south}  W=${p.west}`);
    console.log(`Inner faces (${report.innerFaces.length}): ${report.innerFaces.map((f) => f.join('-')).join(', ') || '-'}`);
    console.log(`Separating triangles: ${report.separating.map((t) => t.join('-')).join(', ') || 'none'}`);
    report.problems.forEach((x) => console.log(`  ! ${x}`));
    console.log(report.valid ? 'Result: PTP, ready for the REL' : 'Result: NOT a PTP');
  }
}

// Export BEFORE the terminal code below, so REL.js gets the class if it is loaded from there.
if (typeof module !== 'undefined' && module.exports) module.exports = PTP;
if (typeof window !== 'undefined') window.PTP = PTP;

//______________________________ Run from the terminal ______________________________

if (typeof require !== 'undefined' && require.main === module) {
  const files = process.argv.slice(2);

  if (files.length) {
    const fs = require('fs');
    const XmlApi = require('./PlanarXML.js');
    for (const file of files) {
      const { graph, problems } = XmlApi.parsePlanarGraphXML(fs.readFileSync(file, 'utf8'));
      if (!graph || problems.length) {
        console.log(`\n=== ${file} ===\nCould not read the XML:`);
        (problems.length ? problems : ['unknown error']).forEach((p) => console.log(`  ! ${p}`));
      } else {
        PTP.print(file, PTP.fromGraph(graph));
      }
    }
  } else {
    // Built-in examples: square N-E-S-W with a centre vertex X.
    const V = [
      { id: 'N', x: 2, y: 0 }, { id: 'E', x: 4, y: 2 }, { id: 'S', x: 2, y: 4 },
      { id: 'W', x: 0, y: 2 }, { id: 'X', x: 2, y: 2 }
    ];
    const E = [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N'], ['X', 'N'], ['X', 'E'], ['X', 'S'], ['X', 'W']];
    const graph = (vs, es) => ({ vertices: vs, edges: es.map(([from, to]) => ({ from, to })) });

    PTP.print('Valid: centre vertex X',
      PTP.fromGraph(graph(V, E)));
    PTP.print('Separating: Y inside triangle N-E-X',
      PTP.fromGraph(graph([...V, { id: 'Y', x: 2.7, y: 1.3 }], [...E, ['Y', 'N'], ['Y', 'E'], ['Y', 'X']])));
    PTP.print('Square face: edge X-E removed',
      PTP.fromGraph(graph(V, E.filter(([a, b]) => !(a === 'X' && b === 'E')))));
  }
}