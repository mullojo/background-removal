const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname, '../main/output-frame.js'), 'utf8')
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('original framing preserves exact dimensions and placement', async () => {
  const { outputFrame } = await modulePromise
  assert.deepEqual(outputFrame(901, 1601), { width: 901, height: 1601, photo: { x: 0, y: 0, width: 901, height: 1601 } })
  assert.deepEqual(outputFrame(901, 1601, 'unknown'), outputFrame(901, 1601))
})

test('portrait to landscape fits the entire photo or crops centrally to fill', async () => {
  const { outputFrame } = await modulePromise
  const fit = outputFrame(900, 1600, '16:9')
  assert.equal(fit.width, 1600)
  assert.equal(fit.height, 900)
  assert.deepEqual(fit.photo, { x: 546.875, y: 0, width: 506.25, height: 900 })
  const fill = outputFrame(900, 1600, '16:9', 'fill')
  assert.equal(fill.photo.x, 0)
  assert.ok(fill.photo.y < 0)
  assert.equal(fill.photo.width, fill.width)
  assert.ok(Math.abs(fill.photo.y * 2 + fill.photo.height - fill.height) < 1e-6)
})

test('all ratios respect the original pixel budget and longest edge', async () => {
  const { FRAME_RATIOS, outputFrame } = await modulePromise
  for (const [width, height] of [[900, 1600], [4000, 500], [801, 603], [1, 1]]) {
    for (const ratio of FRAME_RATIOS) {
      for (const placement of ['fit', 'fill']) {
        const frame = outputFrame(width, height, ratio.id, placement)
        assert.ok(frame.width * frame.height <= width * height)
        assert.ok(Math.max(frame.width, frame.height) <= Math.max(width, height))
        assert.ok(frame.width >= 1 && frame.height >= 1)
        if (ratio.ratio && width > 1) assert.ok(Math.abs(frame.width / frame.height - ratio.ratio) < .01)
        if (placement === 'fit') {
          assert.ok(frame.photo.x >= -1e-6 && frame.photo.y >= -1e-6)
        } else {
          assert.ok(frame.photo.width >= frame.width - 1e-6 && frame.photo.height >= frame.height - 1e-6)
        }
      }
    }
  }
})
