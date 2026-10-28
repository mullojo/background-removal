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


test('fit can anchor a flat bottom edge instead of leaving a gap', async () => {
  const { outputFrame } = await modulePromise
  const top = outputFrame(1000, 1000, '4:5', 'fit', 'top')
  const bottom = outputFrame(1000, 1000, '4:5', 'fit', 'bottom')
  assert.equal(top.photo.y, 0)
  assert.ok(top.photo.height < top.height)
  assert.ok(bottom.photo.y > 0)
  assert.equal(bottom.photo.y + bottom.photo.height, bottom.height)
  assert.equal(bottom.width, top.width)
  assert.equal(bottom.height, top.height)
  assert.equal(bottom.photo.width, top.photo.width, 'Anchoring must not rescale the photo')
})

test('anchors retain the chosen edge during crops and handle all corners', async () => {
  const { FRAME_ANCHORS, outputFrame } = await modulePromise
  for (const placement of ['fit', 'fill']) {
    for (const [width, height] of [[900, 1600], [1600, 900]]) {
      for (const anchor of FRAME_ANCHORS) {
        const frame = outputFrame(width, height, '1:1', placement, anchor.id)
        assert.equal(frame.photo.x, (frame.width - frame.photo.width) * anchor.x)
        assert.equal(frame.photo.y, (frame.height - frame.photo.height) * anchor.y)
        if (anchor.x === 1) assert.ok(Math.abs(frame.photo.x + frame.photo.width - frame.width) < 1e-6)
        if (anchor.y === 1) assert.ok(Math.abs(frame.photo.y + frame.photo.height - frame.height) < 1e-6)
      }
    }
  }
  assert.deepEqual(outputFrame(900, 1600, '1:1', 'fit', 'invalid'), outputFrame(900, 1600, '1:1'))
})


test('workspace coordinates preserve the exact centered output crop across shapes', async () => {
  const { outputFrame, frameViewport } = await modulePromise
  for (const ratio of ['original', '4:5', '16:9']) {
    const frame = outputFrame(930, 1478, ratio)
    for (const [width, height] of [[750, 490], [340, 440]]) {
      const viewport = frameViewport(frame, width, height)
      assert.ok(Math.abs(viewport.width / viewport.height - width / height) < 1e-8)
      assert.ok(Math.abs(viewport.x + viewport.width / 2 - frame.width / 2) < 1e-8)
      assert.ok(Math.abs(viewport.y + viewport.height / 2 - frame.height / 2) < 1e-8)
      assert.ok(viewport.x <= 0 && viewport.y <= 0)
    }
  }
  assert.deepEqual(frameViewport({ width: 900, height: 1600 }, 0, 0), { x: 0, y: 0, width: 900, height: 1600 })
})

function maskWith(draw, channels = 1) {
  const width = 100, height = 100, pixels = new Uint8Array(width * height * channels)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels[(y * width + x) * channels] = draw(x, y) ? 255 : 0
  return { width, height, channels, pixels }
}

test('smart anchors detect sustained contacts, corners, and soft edge masks', async () => {
  const { detectMaskAnchor } = await modulePromise
  assert.equal(detectMaskAnchor(maskWith((x, y) => x > 30 && x < 70 && y > 20)), 'bottom')
  assert.equal(detectMaskAnchor(maskWith((x, y) => x > 30 && x < 70 && y < 80)), 'top')
  assert.equal(detectMaskAnchor(maskWith((x, y) => y > 30 && y < 70 && x > 20)), 'right')
  assert.equal(detectMaskAnchor(maskWith((x, y) => y > 30 && y < 70 && x < 80)), 'left')
  assert.equal(detectMaskAnchor(maskWith((x, y) => x > 30 && y > 30)), 'bottom-right')
  assert.equal(detectMaskAnchor(maskWith((x, y) => x < 70 && y < 70, 4)), 'top-left')
  const soft = maskWith((x, y) => x > 30 && x < 70 && y > 20)
  soft.pixels = soft.pixels.map(value => value ? 210 : 0)
  assert.equal(detectMaskAnchor(soft), 'bottom')
})

test('smart anchors stay centered for isolated noise, detached subjects, and ambiguous edges', async () => {
  const { detectMaskAnchor } = await modulePromise
  assert.equal(detectMaskAnchor(maskWith((x, y) => x === 50 && y === 99)), 'center')
  assert.equal(detectMaskAnchor(maskWith((x, y) => x > 20 && x < 80 && y > 10 && y < 90)), 'center')
  assert.equal(detectMaskAnchor(maskWith(() => true)), 'center')
  assert.equal(detectMaskAnchor(maskWith(() => false)), 'center')
  assert.equal(detectMaskAnchor(maskWith((x, y) => x > 30 && x < 70)), 'center')
})
