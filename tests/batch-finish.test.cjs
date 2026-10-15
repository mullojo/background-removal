const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'main/batch-finish.js'), 'utf8').replaceAll('export ', '')

test('finishing draws each backdrop behind the subject, bounds thumbnails, and releases bitmap/canvas memory', async () => {
  for (const choice of [
    { kind: 'transparent' }, { kind: 'solid', color: '#abcdef' },
    { kind: 'gradient', colors: ['#123456', '#abcdef'] }, { kind: 'image', blob: new Blob(['backdrop']) },
  ]) {
    const canvases = [], bitmaps = [], calls = []
    const cutout = new Blob(['cutout'])
    const context = vm.createContext({
      createImageBitmap: async blob => {
        const bitmap = { width: blob === cutout ? 1200 : 100, height: blob === cutout ? 600 : 100, close() { this.closed = true } }
        bitmaps.push(bitmap)
        return bitmap
      },
      document: { createElement() {
        const canvas = { width: 0, height: 0, getContext: () => ({
          fillRect: (...args) => calls.push(['fill', ...args]),
          createLinearGradient: () => ({ addColorStop: (...args) => calls.push(['stop', ...args]) }),
          drawImage: (...args) => calls.push(['draw', ...args]),
        }), toBlob(callback) {
          assert.ok(bitmaps.every(bitmap => bitmap.closed), 'Close decoded photos before encoding')
          calls.push(['encode', this.width, this.height])
          callback(new Blob(['PNG']))
        } }
        canvases.push(canvas)
        return canvas
      } },
    })
    vm.runInContext(source, context)
    const result = await context.renderBatchFinish(cutout, choice)
    assert.ok(result.thumbnail instanceof Blob)
    assert.ok(calls.some(call => call[0] === 'encode' && call[1] === 240 && call[2] === 120))
    assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0))
    const draws = calls.filter(call => call[0] === 'draw')
    if (choice.kind === 'image') {
      assert.deepEqual(draws[0].slice(2), [0, -300, 1200, 1200], 'Center-crop the backdrop to cover')
      assert.equal(draws[1][1], bitmaps[0], 'Draw the cutout over the backdrop')
    } else assert.equal(draws[0][1], bitmaps[0])
    if (choice.kind === 'transparent') assert.equal(result.blob, cutout)
    if (choice.kind === 'gradient') assert.deepEqual(calls.filter(call => call[0] === 'stop'), [['stop', 0, '#123456'], ['stop', 1, '#abcdef']])
  }
})

test('a failed finish releases source and canvas resources', async () => {
  const bitmap = { width: 1, height: 1, closed: false, close() { this.closed = true } }
  const canvas = { width: 0, height: 0, getContext: () => null }
  const context = vm.createContext({ createImageBitmap: async () => bitmap, document: { createElement: () => canvas } })
  vm.runInContext(source, context)
  await assert.rejects(context.renderBatchFinish(new Blob(['cutout']), { kind: 'transparent' }), /memory/)
  assert.equal(bitmap.closed, true)
  assert.equal(canvas.width, 0)
  assert.equal(canvas.height, 0)
})

test('finishing pauses safely on storage failure and skips old flattened exports', async () => {
  const cutout = new Blob(['cutout']), blob = new Blob(['original'])
  const records = new Map([
    ['one', { id: 'one', name: 'one-sage.png', sourceName: 'one.jpg', bytes: 8, blob, cutout, backdropId: 'sage' }],
    ['two', { id: 'two', name: 'two-sage.png', sourceName: 'two.jpg', bytes: 8, blob, cutout, backdropId: 'sage' }],
    ['old', { id: 'old', name: 'old-sage.png', bytes: 8, blob }],
  ])
  const renders = []
  let studio, concurrent = 0
  const context = vm.createContext({
    ref: value => ({ value }), Blob, setTimeout,
    URL: { createObjectURL: () => 'blob:thumbnail', revokeObjectURL() {} },
    localStore: {
      list: async name => name === 'outputs' ? [...records.values()] : [],
      get: async (name, id) => records.get(id),
      put: async (name, record) => { if (record.id === 'two') throw Error('Storage is full'); records.set(record.id, record) },
    },
    renderBatchFinish: async source => {
      assert.equal(source, cutout)
      assert.equal(studio.finishingBusy.value, true)
      assert.equal(++concurrent, 1)
      renders.push(source)
      await Promise.resolve()
      concurrent--
      return { blob: new Blob(['finished']), thumbnail: new Blob(['small']) }
    },
  })
  vm.runInContext(fs.readFileSync(path.join(root, 'main/supporter-studio.js'), 'utf8').replace(/^import .*\n/gm, '').replaceAll('export ', ''), context)
  studio = context.useSupporterStudio({ isBusy: () => studio.finishingBusy.value, onPresets() {}, onError() {}, getChoices: () => [{ id: 'cream', name: 'Cream' }] })
  await studio.initialize()
  studio.supporter.value = true
  await studio.finishOutputs('cream')
  assert.equal(renders.length, 2)
  assert.equal(records.get('one').name, 'one-cream.png')
  assert.equal(records.get('one').cutout, cutout)
  assert.equal(records.get('two').blob, blob, 'Quota failure preserves the old export')
  assert.equal(records.get('old').name, 'old-sage.png', 'Old opaque exports must never be used as cutouts')
  assert.match(studio.studioNotice.value, /stopped after 1: Storage is full/)
  assert.equal(studio.finishingBusy.value, false)
})
