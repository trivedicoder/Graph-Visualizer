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
    this.contactRepresentation = null

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

  // Generate planar-graph.xml in memory and run the lecture's pipeline on it:
  // circular orders -> PTP check -> refined canonical order -> REL -> rectangular dual.
  // Saving a download is a separate, optional action.
  runContactRep() {
    try {
      this.planarGraphXml = this.editor.graph.toXML()
      var result = ContactRepresentation.createContactRepresentationFromXML(this.planarGraphXml)
      this.contactRepresentation = result

      if (result.problems.length > 0) {
        this.editor.showContactRepresentation(null)
        this.hint.textContent = 'Could not process the generated planar-graph.xml: ' +
          result.problems.join(' ')
        return
      }

      if (!result.relValid) {
        this.editor.showContactRepresentation(null)
        this.hint.textContent = 'No regular edge labeling: ' + result.relProblems.join(' ')
        return
      }

      if (!result.layoutValid) {
        this.editor.showContactRepresentation(null)
        this.hint.textContent = 'Rectangular dual failed its contact check: ' +
          result.layoutProblems.join(' ')
        return
      }

      this.editor.contactPoles = result.poles
      this.editor.showContactRepresentation(result.rectangles, result.layoutSize)
      var p = result.poles
      this.hint.textContent = 'Rectangular dual: ' + Object.keys(result.rectangles).length +
        ' rectangles, ' + result.contacts.length + ' contacts. Poles N=' + p.north + ' E=' + p.east +
        ' S=' + p.south + ' W=' + p.west + '. Canonical order: ' + result.canonicalOrder.join(' ') +
        '. Click a mode button to edit again.'
    } catch (err) {
      this.contactRepresentation = null
      this.editor.showContactRepresentation(null)
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