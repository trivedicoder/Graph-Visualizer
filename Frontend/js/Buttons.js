//__________________________________________________________________________ Buttons __________________________________________________________________________
// Sidebar buttons, graph tabs, and save/load.
// Owns the list of graphs and tells the Editor which one to show.

class Buttons {
  constructor(editor) {
    this.editor      = editor
    this.graphs      = []       // one Graph per tab
    this.activeIndex = -1       // which tab is open
    this.hint        = document.getElementById('hint')
    this.planarGraphXml = null  // most recently generated XML, kept in memory for Contact Rep

    var on = function(id, fn) { document.getElementById(id).addEventListener('click', fn) }

    on('btnAdd',    () => this.setMode('add',    'Click on canvas to add vertices'))
    on('btnEdge',   () => this.setMode('edge',   'Click two vertices to connect them'))
    on('btnDelete', () => this.setMode('delete', 'Click on a vertex or edge to delete it'))
    on('btnClear',  () => { this.editor.graph.clear(); this.editor.setMode(this.editor.mode) })
    on('btnContactRep', () => this.runContactRep())
    on('btnNew',    () => this.newGraph())
    on('btnundo',   () => { if (this.editor.graph.undo()) this.afterHistory('Undone') })
    on('btnredo',   () => { if (this.editor.graph.redo()) this.afterHistory('Redone') })
    on('btnSave',   () => { this.save(); this.setMode('add', 'Click on canvas to add vertices') })
    on('btnExportXml', () => this.exportXml())
    on('btnLoad',   () => {
      var intoNewTab = confirm('Load graph into a new tab?\n\nOK = New tab\nCancel = Replace current graph')
      this.load(intoNewTab)
      this.setMode('add', 'Click on canvas to add vertices')
    })

    this.newGraph()             // start with Graph 1
  }

  setMode(mode, hintText) {
    this.editor.setMode(mode)
    this.hint.textContent = hintText
  }

  afterHistory(hintText) {                          // shared by undo and redo
    this.editor.setMode(this.editor.mode)           // clears any half-picked edge and redraws
    this.hint.textContent = hintText
  }

  //______________________________ Tabs ______________________________
  newGraph(graph) {                                 // add a tab (empty unless a graph is given)
    this.graphs.push(graph || new Graph('Graph ' + (this.graphs.length + 1)))
    this.switchTo(this.graphs.length - 1)
  }

  switchTo(index) {
    this.activeIndex = index
    this.editor.setGraph(this.graphs[index])
    this.renderTabs()
  }

  renderTabs() {
    var container = document.getElementById('tabs')
    container.innerHTML = ''
    this.graphs.forEach((graph, index) => {
      var tab = document.createElement('button')
      tab.textContent = graph.name
      tab.className   = 'tab' + (index === this.activeIndex ? ' active' : '')
      tab.addEventListener('click', () => this.switchTo(index))
      container.appendChild(tab)
    })
  }

  //______________________________ Save / Load ______________________________
  save() {                                          // download the open graph as graph.json
    var json = JSON.stringify(this.editor.graph.toData())
    var blob = new Blob([json], { type: 'application/json' })
    var url  = URL.createObjectURL(blob)
    var a    = document.createElement('a')
    a.href     = url
    a.download = 'graph.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Save an optional copy of the active graph's generated XML.
  exportXml() {
    try {
      var xml  = this.editor.graph.toXML()
      this.downloadPlanarGraphXml(xml)
    } catch (err) {
      alert('Could not export graph: ' + err.message)
    }
  }

  downloadPlanarGraphXml(xml) {
    var blob = new Blob([xml], { type: 'application/xml' })
    var url  = URL.createObjectURL(blob)
    var a    = document.createElement('a')
    a.href     = url
    a.download = 'planar-graph.xml'
    a.click()
    URL.revokeObjectURL(url)
  }

  // The XML produced from the active tab is the handoff format to the contact
  // module. Parse that same XML so the algorithm receives what was exported.
  graphInputFromXml(xml) {
    var documentXml = new DOMParser().parseFromString(xml, 'application/xml')
    if (documentXml.querySelector('parsererror')) {
      throw new Error('Generated planar-graph XML is invalid')
    }

    var root = documentXml.documentElement
    if (root.tagName !== 'planarGraph' || root.getAttribute('schemaVersion') !== '1') {
      throw new Error('Unsupported planar-graph XML format')
    }

    var vertices = Array.from(root.querySelectorAll('vertices > vertex')).map(function(vertex) {
      return {
        id: vertex.getAttribute('id'),
        x: Number(vertex.getAttribute('x')),
        y: Number(vertex.getAttribute('y'))
      }
    })
    var edges = Array.from(root.querySelectorAll('edges > edge')).map(function(edge) {
      return {
        id: edge.hasAttribute('id') ? edge.getAttribute('id') : undefined,
        from: edge.getAttribute('from'),
        to: edge.getAttribute('to')
      }
    })
    var rotations = Array.from(root.querySelectorAll('rotationSystem > rotation')).map(function(rotation) {
      return {
        vertex: rotation.getAttribute('vertex'),
        neighbors: Array.from(rotation.querySelectorAll('neighbor')).map(function(neighbor) {
          return neighbor.getAttribute('ref')
        })
      }
    })
    var outerFace = root.querySelector('outerFace')

    return {
      name: root.getAttribute('name'),
      vertices: vertices,
      edges: edges,
      embedding: {
        rotationSystem: rotations,
        outerFace: outerFace ? outerFace.getAttribute('status') : 'missing'
      }
    }
  }

  // Generate planar-graph.xml in memory and pass the graph parsed from that XML
  // into the contact module. Saving a download is a separate, optional action.
  runContactRep() {
    try {
      this.planarGraphXml = this.editor.graph.toXML()
      var graphInput = this.graphInputFromXml(this.planarGraphXml)
      var result = ContactRepresentation.createContactRepresentation(graphInput)

      if (result.problems.length > 0) {
        this.hint.textContent = 'Could not process the generated planar-graph.xml: ' +
          result.problems.join(' ')
        return
      }

      var adjacencySummary = Array.from(result.adjacency.entries()).map(function(entry) {
        return entry[0] + ': [' + entry[1].join(', ') + ']'
      }).join('; ')
      var traversalSummary = result.traversalOrder.join(' -> ')
      if (!result.layoutValid) {
        this.hint.textContent = 'Adjacency list from XML edges: ' + adjacencySummary +
          '. Traversal: ' + traversalSummary +
          '. Contact layout is still a placeholder.'
        return
      }

      this.hint.textContent = 'Graph processed. Adjacency list: ' + adjacencySummary +
        '. Contact layout generation is not implemented yet.'
    } catch (err) {
      this.hint.textContent = 'Could not run Contact Rep: ' + err.message
    }
  }

  load(intoNewTab) {                                // pick a file, then open it
    var input    = document.createElement('input')
    input.type   = 'file'
    input.accept = 'application/json'
    input.onchange = (event) => {
      var reader = new FileReader()
      reader.onload = (e) => {
        try {
          this.openData(JSON.parse(e.target.result), intoNewTab)
        } catch (err) {
          alert('Invalid graph file')
        }
      }
      reader.readAsText(event.target.files[0])
    }
    input.click()
  }

  openData(data, intoNewTab) {                      // put loaded data into a new tab or the current one
    if (intoNewTab) {
      var g = new Graph('Graph ' + (this.graphs.length + 1))
      g.loadData(data)
      this.newGraph(g)
    } else {
      this.editor.graph.saveHistory()               // so the load can be undone
      this.editor.graph.loadData(data)
      this.editor.setGraph(this.editor.graph)       // redraw with the new data
    }
  }
}