//__________________________________________________________________________ Faces __________________________________________________________________________
// Face walking for planar graphs, using an adjacency list sorted by angle.
//
// Idea:
//   1. For every vertex, list its neighbours sorted by angle (polar coordinates).
//      This sorted list is the "rotation" around the vertex.
//   2. Every edge u-v is used twice, once as u->v and once as v->u (a "dart").
//   3. Start on an unused dart and keep turning: arriving at v from u, leave by
//      the neighbour that comes right after u when going clockwise around v.
//      When you get back to the starting dart, you have walked one face.
//   4. Repeat until every dart is used. Each dart belongs to exactly one face.
//
// Works on the drawing as it is on the canvas, so the edges must not cross.
 

class Faces {



    // -- Polar coordinaets //

    // Angle from a to b degrees, o = right, 90% = up, 180% = left, 270% = down
    static angle(a, b) {
        var deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        return deg < 0 ? deg + 360 : deg;   // Keep in [0, 360)

    }

    static distance(a, b) {
        return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    }

    // -- The list of faces //
    // Map from vertex id to a list of its neighbours sorted by angle.
    // Duplicate edges are added once

    static buildRotationMap(vertices, edges) {
        var rotationMap = new Map();

        vertices.forEach(function (v) { rotationMap.set(v.id, []); });
        edges.forEach(function (e) {
            if (!rotationMap.has(e.from) || !rotationMap.has(e.to)) return;
            if (rotationMap.get(e.from).includes(e.to)) return;  // duplicate edge
            rotationMap.get(e.from).push(e.to);
            rotationMap.get(e.to).push(e.from);
        })

        rotationMap.forEach((list, id) => {
            var v = vertices.find(v => v.id === id);
            list.sort((a, b) => Faces.angle(v, vertices.find(vv => vv.id === a)) - Faces.angle(v, vertices.find(vv => vv.id === b)));
        })
    return rotationMap    
    }

    // -- Load from XML rotation system, or use the fallback rotation map. Returns {rotationMap} or {error}
  static rotationMapFromEmbedding(graph, fallback) {
    var entries = graph.embedding && graph.embedding.rotationSystem;
    if (!entries) return { rotationMap: fallback };

    var rotationMap = new Map();
    graph.vertices.forEach(function (v) { rotationMap.set(v.id, null); });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!rotationMap.has(entry.vertex) || rotationMap.get(entry.vertex) !== null || !Array.isArray(entry.neighbors)) {
        return { error: 'The XML rotation system has a missing or duplicate vertex.' };
      }
      rotationMap.set(entry.vertex, entry.neighbors.slice());
    }

    var invalid = false;
    rotationMap.forEach(function (neighbors, id) {
      var expected = fallback.get(id) || [];
      if (!neighbors || new Set(neighbors).size !== neighbors.length ||
        neighbors.length !== expected.length ||
        expected.some(function (neighbor) { return !neighbors.includes(neighbor); })) {
        invalid = true;
      }
    });
    if (invalid) return { error: 'The XML rotation system does not match the graph edges.' };
    return { rotationMap: rotationMap };
  }


    // -- The list of faces [Face walking]
    // Returns { faces, rotationMap } or {error} // 

    static compute(graph) {
      var crossing = this.findCrossing(graph);
        if (crossing) return { error: 'Edges ' + crossing[0] + ' and ' + crossing[1] + ' cross. Face walking needs a planar drawing.' }

      var derivedRotation = this.buildRotationMap(graph.vertices, graph.edges);
      var embedding = this.rotationMapFromEmbedding(graph, derivedRotation);
      if (embedding.error) return embedding;
      var rotationMap = embedding.rotationMap;
        var used = new Set();
    
        //Stored as "u, v"
        var faces = [];

        rotationMap.forEach((list, u) => {
            list.forEach(v => {
                var dart = u + ',' + v;
                if (used.has(dart)) return;  // already used
            faces.push(this.walkFace(u, v, rotationMap, used))
            })
        })

        faces.forEach(face => {
          face.area = this.signedArea(graph, face.vertices)
          face.outer = face.area > 0
            // Inner faces are clockwise, outer face is counter-clockwise
        })
        this.markDegenerateOuterFaces(faces, rotationMap);
        return { faces, rotationMap, rot: rotationMap }
    }

      // -- Mark outer faces for connected components that have no outer face (degenerate case)
      static markDegenerateOuterFaces(faces, rotationMap) {
        var componentByVertex = new Map();
        var component = 0;
        rotationMap.forEach(function (neighbors, start) {
          if (!neighbors.length || componentByVertex.has(start)) return;
          var stack = [start];
          componentByVertex.set(start, component);
          while (stack.length) {
            var vertex = stack.pop();
            rotationMap.get(vertex).forEach(function (neighbor) {
              if (!componentByVertex.has(neighbor)) {
                componentByVertex.set(neighbor, component);
                stack.push(neighbor);
              }
            });
          }
          component++;
        });

        var outerComponents = new Set();
        faces.forEach(function (face) {
          var id = componentByVertex.get(face.vertices[0]);
          if (face.outer) outerComponents.add(id);
        });
        faces.forEach(function (face) {
          var id = componentByVertex.get(face.vertices[0]);
          if (!outerComponents.has(id)) {
            face.outer = true;
            outerComponents.add(id);
          }
        });
      }

      // -- Load from XML text, compute faces, return {faces, rotationMap, graph} or {error}
      static computeFromXML(xmlText) {
        var xmlApi = typeof PlanarXML !== 'undefined' ? PlanarXML : require('./PlanarXML.js');
        var parsed = xmlApi.parsePlanarGraphXML(xmlText);
        if (!parsed.graph || parsed.problems.length) {
          return { error: parsed.problems.join(' '), problems: parsed.problems };
        }
        var result = this.compute(parsed.graph);
        if (!result.error) result.graph = parsed.graph;
        return result;
      }

    // -- Walk a face starting from dart u->v, using the rotation map and marking used darts
    static walkFace(u, v, rotation, used) {
        var face = { vertices: [] };

         var a = u
    var b = v
    while (!used.has(a + ',' + b)) {
      used.add(a + ',' + b)
      face.vertices.push(a)
      var list = rotation.get(b)
      var i    = list.indexOf(a)
      var next = list[(i - 1 + list.length) % list.length]   // one step clockwise from a
      a = b
      b = next
    }
    return face

    }

     // Shoelace formula. Positive = counter-clockwise on screen.
  static signedArea(graph, ids) {
    var sum = 0
    for (var i = 0; i < ids.length; i++) {
      var p = this.vertexById(graph, ids[i])
      var q = this.vertexById(graph, ids[(i + 1) % ids.length])
      sum += p.x * (-q.y) - q.x * (-p.y)          // flip y so up is positive
    }
    return sum / 2
  }

  // -- Utility functions //
  static vertexById(graph, id) {
    return typeof graph.getVertex === 'function'
      ? graph.getVertex(id)
      : graph.vertices.find(function (vertex) { return vertex.id === id });
  }
 
  //---- Checks -----
  // Returns [edgeId, edgeId] for the first two edges that cross or touch, or null.
  static findCrossing(graph) {
    var E = graph.edges
    for (var i = 0; i < E.length; i++) {
      for (var j = i + 1; j < E.length; j++) {
        var e = E[i], f = E[j]
        var shared = [e.from, e.to].filter(id => id === f.from || id === f.to).length
        if (shared > 0) continue                  // edges that share a vertex are fine (or a duplicate)
        var a = this.vertexById(graph, e.from), b = this.vertexById(graph, e.to)
        var c = this.vertexById(graph, f.from), d = this.vertexById(graph, f.to)
        if (!a || !b || !c || !d) continue
        if (this.segmentsTouch(a, b, c, d)) return [e.id, f.id]
      }
    }
    return null
  }
 
  static orient(p, q, r) {                        // >0 one side, <0 other side, 0 = in a line
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  }
 
  static onSegment(p, q, r) {                     // r lies on segment pq (given they are in a line)
    return Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) &&
           Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y)
  }


 // Returns true if segments ab and cd cross or touch, false otherwise.
  static segmentsTouch(a, b, c, d) {
    var o1 = this.orient(a, b, c), o2 = this.orient(a, b, d)
    var o3 = this.orient(c, d, a), o4 = this.orient(c, d, b)
    if (o1 * o2 < 0 && o3 * o4 < 0) return true   // proper crossing
    if (o1 === 0 && this.onSegment(a, b, c)) return true
    if (o2 === 0 && this.onSegment(a, b, d)) return true
    if (o3 === 0 && this.onSegment(c, d, a)) return true
    if (o4 === 0 && this.onSegment(c, d, b)) return true
    return false
  }
 
  // Euler's formula for each connected piece: V - E + F = 2.
  // Over k pieces (ignoring vertices with no edges): V - E + F = 2k.
  static eulerCheck(graph, result) {
    var rot = result.rotationMap || result.rot
    var V = 0, E = 0
    rot.forEach(function(list) { if (list.length > 0) { V++; E += list.length } })
    E = E / 2                                     // each edge was counted from both ends
    var k = this.countPieces(rot)
    return V - E + result.faces.length === 2 * k
  }
 
  static countPieces(rot) {                       // connected pieces that have at least one edge
    var seen = new Set()
    var k = 0
    rot.forEach(function(list, start) {
      if (list.length === 0 || seen.has(start)) return
      k++
      var stack = [start]
      seen.add(start)
      while (stack.length > 0) {
        var u = stack.pop()
        rot.get(u).forEach(function(w) { if (!seen.has(w)) { seen.add(w); stack.push(w) } })
      }
    })
    return k
  }
 
  //------------------ XML ------------------
  // Builds the XML text. Pass the editor to write grid coordinates (like the hover label),
  // or leave it out to write raw pixels.
  static toXML(graph, editor) {
    var result = this.compute(graph)
    if (result.error) return result
 
    var c     = editor ? (p) => editor.toCoord(p) : (p) => p
    var unit  = editor ? editor.GRID : 1          // so r is measured in grid steps
    var round = (n) => Math.round(n * 100) / 100
 
    var lines = []
    lines.push('<?xml version="1.0" encoding="UTF-8"?>')
    lines.push('<graph name="' + graph.name + '">')
 
    lines.push('  <vertices count="' + graph.vertices.length + '">')
    graph.vertices.forEach((v) => {
      var list = result.rot.get(v.id)
      lines.push('    <vertex id="' + v.id + '" x="' + c(v.x) + '" y="' + c(v.y) + '" degree="' + list.length + '">')
      list.forEach((id) => {                      // already sorted counter-clockwise
        var w = this.vertexById(graph, id)
        lines.push('      <neighbour id="' + id + '" r="' + round(this.distance(v, w) / unit) + '" angle="' + round(this.angle(v, w)) + '"/>')
      })
      lines.push('    </vertex>')
    })
    lines.push('  </vertices>')
 
    lines.push('  <faces count="' + result.faces.length + '">')
    result.faces.forEach(function(f, i) {
      var type = f.outer ? 'outer' : 'inner'
      lines.push('    <face id="' + i + '" type="' + type + '" size="' + f.vertices.length + '">' + f.vertices.join(' ') + '</face>')
    })
    lines.push('  </faces>')
 
    lines.push('</graph>')
    return { xml: lines.join('\n'), faces: result.faces }
  }
 
  // Downloads the open graph as graph.xml. Returns true if it worked.
  static saveXML(editor) {
    var out = this.toXML(editor.graph, editor)
    if (out.error) { alert(out.error); return false }
    var blob = new Blob([out.xml], { type: 'application/xml' })
    var url  = URL.createObjectURL(blob)
    var a    = document.createElement('a')
    a.href     = url
    a.download = 'graph.xml'
    a.click()
    URL.revokeObjectURL(url)
    return true
  }
}

// Lets Node load this file for testing (ignored in the browser)
if (typeof module !== 'undefined') module.exports = Faces
 
  