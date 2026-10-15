const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')

function fixture(scope = '/main/', reachable = true) {
  let clicked, navigated
  const deleted = [], removed = []
  const elements = Object.fromEntries(['recover-button', 'recover-status', 'recover-details', 'recover-report'].map(id => [id, { hidden: true, addEventListener(event, action) { if (id === 'recover-button') clicked = action } }]))
  const registrations = ['/main/', '/lab/'].map(prefix => ({ scope: `https://cutout.example${prefix}`, unregister: async () => { removed.push(prefix); return true } }))
  const names = ['cutout-shell:/main/:1.1.0', 'cutout-shell:/main/:1.5.1', 'cutout-shell:/lab/:1.0.0', 'transformers-cache', 'other-app-cache']
  const context = vm.createContext({
    URL,
    document: { getElementById: id => elements[id] },
    window: { location: { href: `https://cutout.example${scope}recover.html`, replace: url => { navigated = url } }, caches: { keys: async () => names, delete: async name => { deleted.push(name); return true } } },
    navigator: { onLine: true, userAgent: 'Safari fixture', serviceWorker: { getRegistrations: async () => registrations } },
    fetch: async (url, options) => {
      assert.equal(url.pathname, `${scope}recover.html`)
      assert.equal(options.cache, 'no-store')
      return { ok: reachable, text: async () => '<html data-cutout-recovery>' }
    },
  })
  // Accessing or changing any user-data database would fail this test.
  vm.runInContext("Object.defineProperty(globalThis, 'indexedDB', {get(){throw Error('User data must not be touched')}})", context)
  vm.runInContext(fs.readFileSync(path.join(root, 'main/recovery.js'), 'utf8'), context)
  return { click: () => clicked(), deleted, removed, elements, navigated: () => navigated }
}

test('recovery refreshes only the exact app scope and preserves model/other caches and databases', async () => {
  const page = fixture()
  await page.click()
  assert.deepEqual(page.deleted, ['cutout-shell:/main/:1.1.0', 'cutout-shell:/main/:1.5.1'])
  assert.deepEqual(page.removed, ['/main/'])
  assert.equal(page.navigated(), 'https://cutout.example/main/?recovered=1')
})

test('offline recovery leaves the installed shell intact and provides retry details', async () => {
  const page = fixture('/main/', false)
  await page.click()
  assert.deepEqual(page.deleted, [])
  assert.deepEqual(page.removed, [])
  assert.equal(page.navigated(), undefined)
  assert.equal(page.elements['recover-button'].disabled, false)
  assert.equal(page.elements['recover-details'].hidden, false)
})

test('recovery works at the root and stays outside the precached shell', async () => {
  const page = fixture('/')
  await page.click()
  assert.deepEqual(page.deleted, [])
  assert.equal(page.navigated(), 'https://cutout.example/?recovered=1')
  const worker = fs.readFileSync(path.join(root, 'main/service-worker.js'), 'utf8')
  assert.doesNotMatch(worker, /['"]\.\/recover(?:y\.js|\.html)['"]/)
  assert.match(fs.readFileSync(path.join(root, 'main/index.html'), 'utf8'), /tailwind-browser[^>]+defer/)
})
