// ---------- TESTING planar-graph XML (schemaVersion 1) <-> graph object ----------
//
// Graph.toXML() writes the file; parsePlanarGraphXML() reads it back into the shape
// Contact rep.js expects:
//   { name, vertices: [{ id, x, y }], edges: [{ id, from, to }],
//     embedding: { status, source, direction, rotationSystem: [{ vertex, neighbors }] },
//     poles?: { north, east, south, west } }
//
// The parser is a small, dependency-free reader for this schema, so the same code runs in
// the browser and in the Node tests (Node has no DOMParser).

(function (root) {
  'use strict';

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

  function unescapeXml(text) {
    // https://www.w3.org/TR/xml/#syntax
    return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body) => {
      if (body[0] === '#') {
        const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return String.fromCodePoint(code);
      }
      if (!(body in ENTITIES)) throw new Error(`Unknown XML entity '${match}'.`);
      return ENTITIES[body];
    });
  }

  // Returns the root element as { name, attrs, children }. Text content is ignored
  // (this schema keeps everything in attributes).
  function parseXmlTree(text) {
    // https://www.w3.org/TR/xml/#syntax
    const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([A-Za-z_][\w.:-]*)\s*>|<([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;
    const attrPattern = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    const document = { name: '#document', attrs: {}, children: [] };
    const stack = [document];
    let match;

    while ((match = token.exec(text)) !== null) {
      const [, closing, opening, attrText, selfClose, textNode, stray] = match;
      if (stray) throw new Error(`Malformed XML near character ${match.index}.`);
      if (textNode !== undefined) {
        if (textNode.trim() && stack.length === 1) throw new Error('Text found outside the root element.');
        continue;
      }
      if (closing) {
        const open = stack.pop();
        if (stack.length === 0 || open.name !== closing) {
          throw new Error(`Closing tag </${closing}> does not match <${open ? open.name : '?'}>.`);
        }
        continue;
      }
      if (!opening) continue; // comment, declaration, doctype

      const attrs = {};
      let a;
      attrPattern.lastIndex = 0;
      while ((a = attrPattern.exec(attrText || '')) !== null) {
        if (a[1] in attrs) throw new Error(`Duplicate attribute '${a[1]}' on <${opening}>.`);
        attrs[a[1]] = unescapeXml(a[2] !== undefined ? a[2] : a[3]);
      }
      const element = { name: opening, attrs, children: [] };
      stack[stack.length - 1].children.push(element);
      if (!selfClose) stack.push(element);
    }

    if (stack.length !== 1) throw new Error(`Element <${stack[stack.length - 1].name}> is never closed.`);
    if (document.children.length !== 1) throw new Error('XML must have exactly one root element.');
    return document.children[0];
  }

  // Editor ids are numbers; XML attributes are strings. Convert integer-looking ids back so
  // vertex ids, edge endpoints, rotation refs and poles all compare equal.
  function parseId(value) {
    return /^-?\d+$/.test(value) ? Number(value) : value;
  }

  // Returns the first child with the given name, or null if none.
  function child(element, name) {
    return element.children.find((c) => c.name === name) || null;
  }

  /**
   * @param {string} xmlText contents of planar-graph.xml
   * @returns {{ graph: object|null, problems: string[] }}
   */
  function parsePlanarGraphXML(xmlText) {
    let rootElement;
    try {
      rootElement = parseXmlTree(String(xmlText));
    } catch (error) {
      return { graph: null, problems: [error.message] };
    }

    // Validate the root element and schemaVersion, then read vertices, edges, rotationSystem and outerFace.
    const problems = [];
    if (rootElement.name !== 'planarGraph') {
      return { graph: null, problems: [`Root element must be <planarGraph>, found <${rootElement.name}>.`] };
    }
    if (rootElement.attrs.schemaVersion !== '1') {
      problems.push(`Unsupported schemaVersion '${rootElement.attrs.schemaVersion}' (expected '1').`);
    }

    const graph = { name: rootElement.attrs.name || '', vertices: [], edges: [] };

    // Read vertices and edges. Missing sections are a problem, but we still try to read what we can.
    const verticesElement = child(rootElement, 'vertices');
    if (!verticesElement) problems.push('Missing <vertices> section.');
    for (const v of verticesElement ? verticesElement.children : []) {
      if (v.name !== 'vertex') continue;
      if (v.attrs.id === undefined) { problems.push('A <vertex> is missing its id.'); continue; }
      graph.vertices.push({ id: parseId(v.attrs.id), x: Number(v.attrs.x), y: Number(v.attrs.y) });
    }

    // Read edges. Missing sections are a problem, but we still try to read what we can.
    const edgesElement = child(rootElement, 'edges');
    if (!edgesElement) problems.push('Missing <edges> section.');
    for (const e of edgesElement ? edgesElement.children : []) {
      if (e.name !== 'edge') continue;
      if (e.attrs.from === undefined || e.attrs.to === undefined) {
        problems.push(`Edge '${e.attrs.id || '?'}' needs both from and to.`);
        continue;
      }
      const edge = { from: parseId(e.attrs.from), to: parseId(e.attrs.to) };
      if (e.attrs.id !== undefined) edge.id = parseId(e.attrs.id);
      graph.edges.push(edge);
    }

    // Read rotationSystem. Missing section is not a problem; if present, it must be valid.
    const rotationElement = child(rootElement, 'rotationSystem');
    if (rotationElement) {
      const direction = rotationElement.attrs.direction || 'clockwise';
      if (direction !== 'clockwise' && direction !== 'counterclockwise') {
        problems.push(`rotationSystem direction must be clockwise or counterclockwise, found '${direction}'.`);
      }
      const rotationSystem = rotationElement.children
        .filter((r) => r.name === 'rotation')
        .map((r) => {
          const neighbors = r.children.filter((c) => c.name === 'neighbor').map((c) => parseId(c.attrs.ref));
          // Store everything clockwise so the rest of the pipeline has one convention.
          return { vertex: parseId(r.attrs.vertex), neighbors: direction === 'counterclockwise' ? neighbors.reverse() : neighbors };
        });
      graph.embedding = {
        status: rotationElement.attrs.status || 'candidate',
        source: rotationElement.attrs.source || '',
        direction: 'clockwise',
        rotationSystem
      };
    }

    // Read outerFace and poles. Missing section is not a problem; if present, it must be valid.
    const outerFace = child(rootElement, 'outerFace');
    if (outerFace && outerFace.attrs.status === 'selected') {
      const poles = {};
      for (const pole of outerFace.children.filter((c) => c.name === 'pole')) {
        poles[pole.attrs.side] = parseId(pole.attrs.ref);
      }
      const missing = ['north', 'east', 'south', 'west'].filter((side) => poles[side] === undefined);
      if (missing.length) problems.push(`outerFace is selected but missing poles: ${missing.join(', ')}.`);
      else graph.poles = { north: poles.north, east: poles.east, south: poles.south, west: poles.west };
    }

    return { graph, problems };
  }

  // Browser only: save graph.toXML() as a file (default name planar-graph.xml).
  function downloadPlanarXML(graph, filename = 'planar-graph.xml', options) {
    const blob = new Blob([graph.toXML(options)], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const PlanarXML = { parseXmlTree, parsePlanarGraphXML, downloadPlanarXML };

  if (typeof module !== 'undefined' && module.exports) module.exports = PlanarXML;
  if (typeof root !== 'undefined' && root) root.PlanarXML = PlanarXML;
})(typeof window !== 'undefined' ? window : undefined);
