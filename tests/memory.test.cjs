const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname, '../main/memory.js'), 'utf8')
const memoryModule = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('image-buffer estimates count each resource once and return to zero after cleanup', async () => {
  const { createMemoryTracker } = await memoryModule
  const updates = []
  const tracker = createMemoryTracker(value => updates.push(value))
  const canvas = { width: 4000, height: 3000 }, bitmap = { width: 4000, height: 3000 }
  tracker.track(canvas)
  tracker.track(canvas)
  assert.equal(tracker.snapshot().imageBytes, 48000000)
  tracker.track(bitmap)
  assert.equal(tracker.snapshot().peakImageBytes, 96000000)
  tracker.release(bitmap)
  tracker.release(canvas)
  assert.deepEqual(tracker.snapshot(), { imageBytes: 0, peakImageBytes: 96000000, imageResources: 0 })
  assert.equal(updates.at(-1).imageBytes, 0)
})

test('unavailable browser readings remain unknown rather than claiming zero pressure', async () => {
  const { browserMemory } = await memoryModule
  assert.deepEqual(browserMemory({}), { heap: null, deviceGB: null, availableRamBytes: null, systemPressure: null })
  const restricted = { get performance() { throw Error('Restricted') } }
  assert.equal(browserMemory(restricted).heap, null)
})

test('heap and coarse device readings never turn into a free-RAM budget', async () => {
  const { browserMemory, memoryMB } = await memoryModule
  const snapshot = browserMemory({ performance: { memory: { usedJSHeapSize: 10485760, jsHeapSizeLimit: 104857600 } }, navigator: { deviceMemory: 4 } })
  assert.deepEqual(snapshot.heap, { usedBytes: 10485760, limitBytes: 104857600 })
  assert.equal(snapshot.deviceGB, 4)
  assert.equal(snapshot.availableRamBytes, null)
  assert.equal(snapshot.systemPressure, null)
  assert.equal(memoryMB(snapshot.heap.usedBytes), '10.0 MB')
})
