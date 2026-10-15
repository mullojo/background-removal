const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')

test('a throwing IndexedDB getter cannot abort module initialization or the free studio', async () => {
  const context = vm.createContext({})
  vm.runInContext(`Object.defineProperty(globalThis, 'indexedDB', { get() { throw Error('SecurityError') } })`, context)
  assert.doesNotThrow(() => vm.runInContext(fs.readFileSync(path.join(root, 'main/local-store.js'), 'utf8').replaceAll('export ', ''), context))
  await assert.rejects(context.createLocalStore().list('outputs'), /Local storage is blocked/)
})

function boot(loadApp, mounted = false) {
  const elements = Object.fromEntries(['startup-status', 'startup-title', 'startup-message', 'startup-details', 'startup-report', 'startup-retry'].map(id => [id, { hidden: true, value: '', textContent: '', addEventListener() {} }]))
  let showWaiting
  const context = vm.createContext({
    document: { getElementById: id => elements[id], querySelector: () => mounted ? {} : null },
    window: { location: { pathname: '/main/', reload() {} }, addEventListener() {}, removeEventListener() {} },
    navigator: { userAgent: 'Safari fixture' }, console: { error() {} },
    setTimeout: callback => { showWaiting = callback; return 1 }, clearTimeout() {}, loadApp,
  })
  vm.runInContext(fs.readFileSync(path.join(root, 'main/startup.js'), 'utf8').replace("import('./app.js')", 'loadApp()'), context)
  return { elements, showWaiting: () => showWaiting() }
}

test('failed imports and failed rendering show readable startup details instead of a blank screen', async () => {
  for (const load of [() => Promise.reject(Error('Importing a module script failed')), () => Promise.resolve()]) {
    const { elements } = boot(load)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(elements['startup-status'].hidden, false)
    assert.equal(elements['startup-title'].textContent, 'Cutout couldn’t open')
    assert.equal(elements['startup-details'].hidden, false)
    const report = JSON.parse(elements['startup-report'].value)
    assert.equal(report.stage, 'startup')
    assert.equal(report.path, '/main/')
    assert.match(report.message, /module|render/)
  }
})

test('slow startup shows a waiting state, and successful mounting hides it', async () => {
  let finish
  const { elements, showWaiting } = boot(() => new Promise(resolve => { finish = resolve }), true)
  showWaiting()
  assert.equal(elements['startup-status'].hidden, false)
  finish()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(elements['startup-status'].hidden, true)
})
