const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { webcrypto } = require('node:crypto')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'main/giving.js'), 'utf8')
const giving = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const now = 1792010000000
const id = digit => digit.repeat(64)
const response = value => ({ ok: true, json: async () => value })

test('gift request freezes a fresh USD quote, snapshots existing payments, and produces a BIP21 URI', async () => {
  const g = await giving
  const fetcher = async url => response(url.endsWith('/prices') ? { USD: 100000, time: now / 1000 } : [{ txid: id('a') }])
  const intent = await g.createGiftIntent(10, fetcher, now, 7)
  assert.equal(intent.sats, 10008)
  assert.equal(intent.minimumSats, 10000)
  assert.deepEqual(intent.baseline, [id('a')])
  assert.equal(intent.expiresAt, now + 1800000)
  assert.equal(g.paymentUri(intent), `bitcoin:${g.BITCOIN_ADDRESS}?amount=0.00010008&label=Cutout%20gift`)
  assert.deepEqual(g.decodeRequest(g.encodeRequest(intent)), intent)
  await assert.rejects(g.createGiftIntent(0, fetcher, now), /between/)
  await assert.rejects(g.createGiftIntent(10, async url => response(url.endsWith('/prices') ? { USD: 100000, time: now / 1000 - 7200 } : []), now), /fresh Bitcoin price/)
})

test('matching ignores old gifts, wrong destinations, altered amounts and ambiguous candidates', async () => {
  const g = await giving
  const intent = { sats: 10008, baseline: [id('a')], createdAt: now }
  const tx = (txid, amount = 10008, address = g.BITCOIN_ADDRESS, status = { confirmed: false }) => ({ txid, vout: [{ value: amount, scriptpubkey_address: address }], status })
  const transactions = [tx(id('a')), tx(id('b'), 10000), tx(id('c'), 10008, 'wrong'), tx(id('d'), 10008, g.BITCOIN_ADDRESS, { confirmed: true, block_time: now / 1000 - 3600 }), tx(id('e')), tx(id('f'))]
  assert.deepEqual(g.matchingTransactions(intent, transactions).map(tx => tx.txid), [id('e'), id('f')])
  assert.equal(g.manualTransaction(intent, tx(id('e'), 15000)).txid, id('e'))
  assert.equal(g.manualTransaction(intent, tx(id('e'), 15000, 'wrong')), undefined)
  assert.equal(g.manualTransaction(intent, tx(id('a'), 15000)), undefined)
  assert.equal(g.receivedSats({ vout: [{ value: -5, scriptpubkey_address: g.BITCOIN_ADDRESS }] }), 0)
})

test('portable supporter code requires a qualifying payment and is rechecked against the configured address', async () => {
  const g = await giving
  const receipt = { v: 1, txid: id('a'), sats: 10008, rate: 100000, createdAt: now }
  const code = g.encodeCode(receipt)
  assert.deepEqual(g.decodeCode(` \n${code}\n`), receipt)
  assert.equal(g.isSupporter(receipt), true)
  assert.equal(g.isSupporter({ ...receipt, sats: 9999 }), false)
  assert.deepEqual(await g.verifyCode(code, async () => response({ txid: receipt.txid, vout: [{ scriptpubkey_address: g.BITCOIN_ADDRESS, value: 10008 }] })), receipt)
  await assert.rejects(g.verifyCode(code, async () => response({ txid: receipt.txid, vout: [{ scriptpubkey_address: 'wrong', value: 10008 }] })), /does not match/)
  assert.throws(() => g.decodeCode('CUTOUT1.bad'), /could not be read/)
  assert.throws(() => g.decodeCode(g.encodeCode({ ...receipt, txid: '../bad' })), /incomplete/)
  await assert.rejects(g.apiJson('/v1/prices', async () => ({ ok: false, status: 429 })), /busy/)
})

test('batch validation, backdrop crop, and storage-full pause preserve sequential processing', async () => {
  let running = 0, calls = 0
  const saved = new Map()
  const context = vm.createContext({
    Blob, crypto: webcrypto, setTimeout, URL, ref: value => ({ value }), requestPersistence: async () => true, downloadBlob() {},
    localStore: { list: async () => [], put: async (name, item) => { if (saved.size === 1) throw Error('Storage is full'); saved.set(item.id, item) } },
  })
  vm.runInContext(fs.readFileSync(path.join(root, 'main/supporter-studio.js'), 'utf8').replace(/^import .*\n/gm, '').replaceAll('export ', ''), context)
  const output = Object.assign(new Blob(['PNG']), { name: 'image.png' })
  const studio = context.useSupporterStudio({
    isBusy: () => false, processFile: async () => { assert.equal(++running, 1); calls++; await new Promise(resolve => setImmediate(resolve)); running--; return true },
    clearPhoto() {}, getOutput: () => output, onPresets() {}, onError() {},
  })
  await studio.setSupporter(true)
  await studio.runBatch({ target: { files: Array.from({ length: 3 }, () => ({ type: 'image/png', size: 100, name: 'image.png' })), value: '' } })
  assert.equal(calls, 2)
  assert.equal(saved.size, 1)
  assert.equal(studio.outputs.value.length, 1)
  assert.match(studio.studioNotice.value, /Batch paused: Storage is full/)
  assert.equal(studio.batchRunning.value, false)
  assert.throws(() => context.batchFiles(Array(21).fill({ type: 'image/png', size: 1 })), /up to 20/)
  assert.throws(() => context.batchFiles([{ type: 'text/plain', size: 1 }]), /image files only/)
  assert.throws(() => context.validatePreset({ name: 'Brand', kind: 'solid', color: 'url(unsafe)' }), /valid backdrop colors/)
  assert.deepEqual({ ...context.coverRect(200, 100, 100, 100) }, { x: -50, y: 0, width: 200, height: 100 })
})

test('code and output downloads attach a real link and defer URL revocation', async () => {
  const { downloadBlob } = await import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(path.join(root, 'main/local-store.js'), 'utf8')).toString('base64')}`)
  const originalDocument = global.document, originalTimeout = global.setTimeout
  let attached, clicked, removed, deferred
  global.document = {
    body: { append(link) { attached = link } },
    createElement() { return { click() { assert.equal(attached, this); clicked = this.href }, remove() { removed = true } } },
  }
  global.setTimeout = (callback, delay) => { deferred = { callback, delay } }
  try {
    downloadBlob(new Blob(['CUTOUT1.test']), 'cutout-code.txt')
    assert.equal(attached.download, 'cutout-code.txt')
    assert.match(clicked, /^blob:/)
    assert.equal(removed, true)
    assert.equal(deferred.delay, 60000)
    deferred.callback()
  } finally { global.document = originalDocument; global.setTimeout = originalTimeout }
})

test('giving dialog follows shared open state and dismissal keeps its parent synchronized', async () => {
  const watches = [], emitted = []
  let focused = 0, opened = 0, closed = 0
  const context = vm.createContext({
    ...await giving,
    ref: value => ({ value }), computed: getter => ({ get value() { return getter() } }),
    nextTick: () => Promise.resolve(), watch: (getter, callback) => watches.push({ getter, callback }),
    onMounted() {}, onUnmounted() {},
    document: { activeElement: { focus() { focused++ } } },
    BITCOIN_ADDRESS: 'test-address',
  })
  vm.runInContext(fs.readFileSync(path.join(root, 'main/giving-ui.js'), 'utf8').replace(/^import .*\n/gm, '').replace('export const GivingPanel', 'globalThis.GivingPanel'), context)
  const props = { modelValue: false, diagnostics: () => '{}' }
  const panel = context.GivingPanel.setup(props, { emit: (...event) => emitted.push(event) })
  panel.dialog.value = { showModal() { opened++ }, close() { closed++ }, scrollTop: 999 }
  assert.equal(watches.length, 1)
  for (let i = 0; i < 3; i++) {
    props.modelValue = true
    await watches[0].callback(watches[0].getter())
    assert.equal(panel.opened.value, true)
    assert.equal(panel.dialog.value.scrollTop, 0)
    panel.close()
    assert.deepEqual(emitted.at(-1), ['update:modelValue', false])
    props.modelValue = false
    watches[0].callback(watches[0].getter())
    assert.equal(panel.opened.value, false)
  }
  assert.equal(opened, 3)
  assert.equal(closed, 3, 'Parent-state echo must not close a second time')
  assert.equal(focused, 3)
  const html = fs.readFileSync(path.join(root, 'main/index.html'), 'utf8')
  assert.equal((html.match(/@click="openGiving"/g) || []).length, 3)
  assert.match(html, /<giving-panel v-model="givingOpen"[^>]*><\/giving-panel>/)
  assert.doesNotMatch(html, /givingPanel\.open/)
  assert.match(context.GivingPanel.template, /@click="\$emit\('update:modelValue', true\)"/)
})
