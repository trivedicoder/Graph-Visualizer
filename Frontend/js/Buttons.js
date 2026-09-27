//__________________________________________________________________________ Buttons __________________________________________________________________________
// Sidebar buttons, graph tabs, and save/load.
// Owns the list of graphs and tells the Editor which one to show.

class Buttons {
  constructor(editor) {
    this.editor      = editor
    this.graphs      = []       // one Graph per tab
    this.activeIndex = -1       // which tab is open
    this.hint        = document.getElementById('hint')

    var on = function(id, fn) { document.getElementById(id).addEventListener('click', fn) }

    on('btnAdd',    () => this.setMode('add',    'Click on canvas to add vertices'))
    on('btnEdge',   () => this.setMode('edge',   'Click two vertices to connect them'))
    on('btnDelete', () => this.setMode('delete', 'Click on a vertex or edge to delete it'))
    on('btnClear',  () => { this.editor.graph.clear(); this.editor.setMode(this.editor.mode) })
    on('btnNew',    () => this.newGraph())
    on('btnundo',   () => { if (this.editor.graph.undo()) this.afterHistory('Undone') })
    on('btnredo',   () => { if (this.editor.graph.redo()) this.afterHistory('Redone') })
    on('btnSave',   () => { this.save(); this.setMode('add', 'Click on canvas to add vertices') })
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