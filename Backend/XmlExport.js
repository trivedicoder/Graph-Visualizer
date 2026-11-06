//__________________________________________________________________________ XmlExport __________________________________________________________________________
// Saves the open graph as graph.xml.
// Every node lists all of its neighbours using polar coordinates (angle + distance) measured from that node.
// Neighbours are sorted by angle (counter-clockwise), so the list also gives the order the edges go around each node.
// Only reads the graph. It does not change any of the Frontend code.
//
// Use from the console:  new XmlExport(editor.graph, editor.GRID, editor.ORIGIN).run()

class XmlExport {
    constructor(graph, grid = 50, origin = 50) {      // grid and origin match the Editor, so pixels turn into grid units
        this.graph  = graph;
        this.grid   = grid;
        this.origin = origin;
    }

    //______________________________ XML ______________________________
    export() {
        const neighborMap = this.buildNeighbors();
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += `<graph name="${this.escape(this.graph.name)}" nodes="${this.graph.vertices.length}" edges="${this.liveEdges().length}">\n`;
        for (const node of this.graph.vertices) {
            const neighbors = this.getSortedNeighbors(node, neighborMap.get(node.id));
            xml += `  <node id="${node.id}" x="${this.toGrid(node.x)}" y="${this.toGrid(node.y)}" degree="${neighbors.length}">\n`;
            for (const neighbor of neighbors) {
                xml += `    <neighbor id="${neighbor.id}" edge="${neighbor.edge}" angle="${neighbor.angle}" distance="${neighbor.distance}"/>\n`;
            }
            xml += '  </node>\n';
        }
        xml += '</graph>';
        return xml;
    }

    //______________________________ Neighbors ______________________________
    buildNeighbors() {                                  // vertex id -> list of { vertex, edge } (from graph.edges)
        const map = new Map();
        for (const v of this.graph.vertices) map.set(v.id, []);      // every vertex gets a list, even with no edges
        for (const e of this.liveEdges()) {
            map.get(e.from).push({ vertex: this.graph.getVertex(e.to),   edge: e.id });
            map.get(e.to).push({ vertex: this.graph.getVertex(e.from), edge: e.id });
        }
        return map;
    }

    liveEdges() {                                       // edges whose two ends both exist
        return this.graph.edges.filter(e => this.graph.getVertex(e.from) && this.graph.getVertex(e.to));
    }

    getSortedNeighbors(node, list) {                    // counter-clockwise from 0° (right)
        return list
            .map(n => ({
                id:       n.vertex.id,
                edge:     n.edge,
                angle:    this.calculateAngle(node, n.vertex),
                distance: this.calculateDistance(node, n.vertex)
            }))
            .sort((a, b) => {
                if (a.angle !== b.angle)       return a.angle - b.angle;          // smaller angle first
                if (a.distance !== b.distance) return a.distance - b.distance;    // same direction: closer one first
                return a.edge - b.edge;                                           // same edge drawn twice: older one first
            });
    }

    //______________________________ Polar Coordinates ______________________________
    calculateAngle(node, neighbor) {                    // degrees: 0 = right, 90 = up
        const dx = neighbor.x - node.x;
        const dy = node.y - neighbor.y;                 // canvas y goes down, so flip it so 90 is up
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;                    // keep angles between 0 and 360
        return this.round(angle);
    }

    calculateDistance(node, neighbor) {                 // in grid squares, not pixels
        const dx = neighbor.x - node.x;
        const dy = neighbor.y - node.y;
        return this.round(Math.sqrt(dx * dx + dy * dy) / this.grid);
    }

    toGrid(p) {                                         // pixel -> grid coordinate (not rounded, st-ordering can move vertices off the grid)
        return this.round((p - this.origin) / this.grid);
    }

    round(n) {                                          // 2 decimal places, kept as a number so sorting works
        return Math.round(n * 100) / 100;
    }

    escape(text) {                                      // makes text safe to put inside XML
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    //______________________________ Checking ______________________________
    isValid(xml) {                                      // every edge shows up in both of its nodes' lists
        const edges = this.liveEdges();
        if ((xml.match(/<node /g) || []).length !== this.graph.vertices.length) return false;
        if ((xml.match(/<neighbor /g) || []).length !== edges.length * 2) return false;    // each edge is listed twice
        for (const e of edges) {
            if (!this.nodeBlock(xml, e.from).includes(`<neighbor id="${e.to}" edge="${e.id}"`))   return false;
            if (!this.nodeBlock(xml, e.to).includes(`<neighbor id="${e.from}" edge="${e.id}"`)) return false;
        }
        return true;
    }

    nodeBlock(xml, id) {                                // the text between <node id="..."> and </node>
        const start = xml.indexOf(`<node id="${id}"`);
        if (start === -1) return '';
        return xml.slice(start, xml.indexOf('</node>', start));
    }

    //______________________________ Save ______________________________
    download(xml) {                                     // download as graph.xml (same way Buttons.save does the JSON)
        const blob = new Blob([xml], { type: 'application/xml' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = 'graph.xml';
        a.click();
        URL.revokeObjectURL(url);
    }

    run() {                                             // build, check, download. Returns true if it worked
        if (this.graph.vertices.length === 0) { alert('Graph is empty.'); return false; }
        const xml = this.export();
        if (!this.isValid(xml)) { alert('The XML does not match the graph.'); return false; }
        this.download(xml);
        return true;
    }
}

// Lets Node load this file for testing (ignored in the browser)
if (typeof module !== 'undefined') module.exports = XmlExport;