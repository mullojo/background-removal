const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const source = fs.readFileSync(path.join(__dirname, '../main/zip.js'), 'utf8')
const zipModule = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('batch ZIP opens in an independent reader with Unicode, duplicate names, CRCs, and safe paths', async () => {
  const { createStoredZip } = await zipModule
  const progress = []
  const zip = await createStoredZip([
    { name: 'photo.png', blob: new Blob(['123456789']) },
    { name: 'PHOTO.png', blob: new Blob(['second']) },
    { name: 'café.png', blob: new Blob(['third']) },
    { name: '../unsafe.png', blob: new Blob(['fourth']) },
  ], { onProgress: count => progress.push(count) })
  assert.equal(zip.type, 'application/zip')
  assert.deepEqual(progress, [1, 2, 3, 4])
  const read = spawnSync('python3', ['-c', `import io, json, sys, zipfile
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
 print(json.dumps({'names': archive.namelist(), 'contents': [archive.read(name).decode() for name in archive.namelist()], 'crc': archive.infolist()[0].CRC, 'bad': archive.testzip()}))`], { input: Buffer.from(await zip.arrayBuffer()), encoding: 'utf8' })
  assert.equal(read.status, 0, read.stderr)
  const result = JSON.parse(read.stdout)
  assert.deepEqual(result.names, ['photo.png', 'PHOTO (2).png', 'café.png', '__unsafe.png'])
  assert.deepEqual(result.contents, ['123456789', 'second', 'third', 'fourth'])
  assert.equal(result.crc, 0xcbf43926)
  assert.equal(result.bad, null)
})

test('ZIP cancellation and missing or excessive files fail without producing an archive', async () => {
  const { createStoredZip } = await zipModule
  const controller = new AbortController()
  const entry = { name: 'photo.png', blob: new Blob(['data']) }
  await assert.rejects(createStoredZip([entry], { signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' })
  await assert.rejects(createStoredZip([]), /No saved images/)
  await assert.rejects(createStoredZip([{ name: 'missing.png' }]), /no longer available/)
  await assert.rejects(createStoredZip(Array(101).fill(entry)), /shelf limit/)
})

test('studio ZIP reads retained outputs sequentially and leaves the shelf intact', async () => {
  const vm = require('node:vm')
  const { createStoredZip } = await zipModule
  const saved = new Map([
    ['one', { id: 'one', name: 'same.png', blob: new Blob(['first']), thumbnail: new Blob(['small']), bytes: 5, createdAt: 1 }],
    ['two', { id: 'two', name: 'same.png', blob: new Blob(['second']), thumbnail: new Blob(['small']), bytes: 6, createdAt: 2 }],
  ])
  const reads = [], urls = new Set()
  let activeReads = 0, downloaded, studio
  const context = vm.createContext({
    Blob, AbortController, createStoredZip, setTimeout,
    ref: value => ({ value }),
    URL: { createObjectURL: () => { const url = `blob:${urls.size}`; urls.add(url); return url }, revokeObjectURL: url => urls.delete(url) },
    localStore: {
      list: async name => name === 'outputs' ? [...saved.values()] : [],
      get: async (name, id) => {
        assert.equal(++activeReads, 1)
        assert.equal(studio.archiveBusy.value, true)
        reads.push(id)
        await Promise.resolve()
        activeReads--
        return saved.get(id)
      },
    },
    downloadBlob: (blob, name) => { downloaded = { blob, name } },
  })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../main/supporter-studio.js'), 'utf8').replace(/^import .*\n/gm, '').replaceAll('export ', ''), context)
  studio = context.useSupporterStudio({ isBusy: () => studio.archiveBusy.value, onPresets() {} })
  await studio.initialize()
  assert.equal(urls.size, 2)
  await studio.downloadBatch()
  assert.deepEqual(reads, ['one', 'two'])
  assert.equal(downloaded.blob.type, 'application/zip')
  assert.match(downloaded.name, /^cutout-batch-.*\.zip$/)
  assert.equal(saved.size, 2)
  assert.equal(studio.outputs.value.length, 2)
  assert.equal(studio.archiveBusy.value, false)
  studio.disposeStudio()
  assert.equal(urls.size, 0)
})
