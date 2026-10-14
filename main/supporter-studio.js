import { ref } from './vendor/vue-3.5.43.esm-browser.prod.js'
import { localStore, downloadBlob, requestPersistence } from './local-store.js'

export const BATCH_LIMIT = 20
export const OUTPUT_LIMIT_BYTES = 200 * 1024 * 1024
export function batchFiles(files) {
  const list = Array.from(files)
  if (!list.length) throw new Error('Choose some photos first.')
  if (list.length > BATCH_LIMIT) throw new Error(`Choose up to ${BATCH_LIMIT} photos per batch.`)
  if (list.some(file => !file.type.startsWith('image/'))) throw new Error('Choose image files only.')
  if (list.some(file => file.size > 40 * 1024 * 1024) || list.reduce((sum, file) => sum + file.size, 0) > OUTPUT_LIMIT_BYTES) throw new Error('Choose smaller photos: up to 40 MB each and 200 MB per batch.')
  return list
}
export function validatePreset(preset) {
  if (!preset.name?.trim() || preset.name.length > 40) throw new Error('Name your backdrop using up to 40 characters.')
  if (!['solid', 'gradient', 'image'].includes(preset.kind)) throw new Error('Choose a color, gradient, or image.')
  const colors = preset.kind === 'solid' ? [preset.color] : preset.kind === 'gradient' ? preset.colors : []
  if (colors.some(color => !/^#[a-f0-9]{6}$/i.test(color)) || (preset.kind === 'gradient' && colors.length !== 2)) throw new Error('Choose valid backdrop colors.')
  if (preset.kind === 'image' && !(preset.blob instanceof Blob)) throw new Error('Choose a backdrop image.')
}
export function coverRect(width, height, targetWidth, targetHeight) {
  const scale = Math.max(targetWidth / width, targetHeight / height)
  return { x: (targetWidth - width * scale) / 2, y: (targetHeight - height * scale) / 2, width: width * scale, height: height * scale }
}
export function useSupporterStudio({ processFile, clearPhoto, getOutput, isBusy, onPresets, onError }) {
  const supporter = ref(false), presets = ref([]), outputs = ref([]), storageNotice = ref(''), studioNotice = ref('')
  const presetName = ref(''), presetKind = ref('solid'), colorOne = ref('#b7c8b1'), colorTwo = ref('#f8d2c4'), presetImage = ref(null), presetSaving = ref(false)
  const batchInput = ref(null), batchRunning = ref(false), batchStop = ref(false), batchProgress = ref(''), batchErrors = ref([])
  let presetUrls = []
  async function refreshPresets() {
    const saved = await localStore.list('presets')
    const next = saved.map(preset => ({ ...preset, url: preset.blob ? URL.createObjectURL(preset.blob) : undefined }))
    const previous = presetUrls; presetUrls = next.map(item => item.url).filter(Boolean)
    presets.value = next; onPresets(next)
    // Let Vue detach old swatches before revoking their URLs.
    setTimeout(() => previous.forEach(url => URL.revokeObjectURL(url)), 0)
  }
  async function refreshOutputs() {
    outputs.value = (await localStore.list('outputs')).map(({ blob, ...item }) => item).sort((a, b) => a.createdAt - b.createdAt)
  }
  async function initialize() {
    try { await Promise.all([refreshPresets(), refreshOutputs()]) }
    catch (error) { storageNotice.value = error.message }
  }
  async function setSupporter(value, { preview = false } = {}) {
    supporter.value = value
    if (preview) {
      storageNotice.value = 'Testing extras in this tab. No gift or supporter code has been created.'
      return
    }
    if (!value) storageNotice.value = ''
    if (value) {
      try {
        const durable = await requestPersistence()
        storageNotice.value = durable ? 'Saved on this device. Keep a backup of your supporter code.' : 'Saved on this device. Your browser may clear storage; keep a backup of your code and downloads.'
      } catch (error) { storageNotice.value = error.message }
    }
  }
  async function savePreset() {
    if (!supporter.value || isBusy() || presetSaving.value) return
    presetSaving.value = true; studioNotice.value = ''
    let bitmap, canvas
    try {
      if (presets.value.length >= 20) throw new Error('You have 20 saved backdrops. Remove one before adding another.')
      const preset = { id: `brand-${crypto.randomUUID()}`, name: presetName.value.trim(), kind: presetKind.value,
        color: colorOne.value, colors: [colorOne.value, colorTwo.value] }
      if (preset.kind === 'image') {
        const file = presetImage.value
        if (!file || !file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) throw new Error('Choose a backdrop image up to 10 MB.')
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
        canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        const context = canvas.getContext('2d'); if (!context) throw new Error('Could not prepare this backdrop. Try a smaller image.')
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        preset.blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9))
      }
      validatePreset(preset)
      await localStore.put('presets', preset); await refreshPresets()
      presetName.value = ''; presetImage.value = null; studioNotice.value = 'Backdrop saved. Choose it below to use it.'
    } catch (error) { studioNotice.value = error.message }
    finally { bitmap?.close(); if (canvas) { canvas.width = 0; canvas.height = 0 }; presetSaving.value = false }
  }
  async function removePreset(id) {
    if (isBusy()) return
    try { await localStore.remove('presets', id); await refreshPresets() }
    catch (error) { studioNotice.value = error.message }
  }
  async function runBatch(event) {
    const files = Array.from(event.target.files || []); event.target.value = ''
    if (!supporter.value || isBusy()) return
    let list
    try {
      if (globalThis.navigator?.onLine === false) throw new Error('Connect to the internet before starting a batch.')
      list = batchFiles(files)
    } catch (error) { studioNotice.value = error.message; return }
    batchRunning.value = true; batchStop.value = false; batchErrors.value = []; studioNotice.value = ''
    let stored = 0
    try {
      for (let index = 0; index < list.length && !batchStop.value; index++) {
        if (outputs.value.length >= 100 || outputs.value.reduce((sum, item) => sum + item.bytes, 0) >= OUTPUT_LIMIT_BYTES) throw new Error('Your batch shelf is full. Download and remove some saved outputs before continuing.')
        batchProgress.value = `${index + 1} of ${list.length} · ${list[index].name}`
        const result = await processFile(list[index])
        if (!result) { batchErrors.value.push(`${list[index].name}: processing failed. Try it individually with WASM.`); continue }
        const output = getOutput()
        if (!output) throw new Error('No export was produced. The current photo is still in your workspace.')
        if (outputs.value.reduce((sum, item) => sum + item.bytes, 0) + output.size > OUTPUT_LIMIT_BYTES) throw new Error('This output exceeds the 200 MB shelf limit. Download it from the workspace before continuing.')
        const record = { id: crypto.randomUUID(), name: output.name, bytes: output.size, createdAt: Date.now(), blob: output }
        await localStore.put('outputs', record)
        outputs.value.push({ id: record.id, name: record.name, bytes: record.bytes, createdAt: record.createdAt }); stored++
        clearPhoto()
        // Release this photo and yield before the next single-use model worker.
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      studioNotice.value = `${stored} new ${stored === 1 ? 'output' : 'outputs'} saved on this device.${batchStop.value ? ' Batch paused after the current photo. Choose the remaining files when you’re ready.' : ''}`
    } catch (error) { studioNotice.value = `Batch paused: ${error.message}`; onError(error) }
    finally { batchRunning.value = false; batchProgress.value = '' }
  }
  async function downloadOutput(id) {
    try {
      const record = await localStore.get('outputs', id)
      if (!record?.blob) throw new Error('This saved image is no longer available.')
      downloadBlob(record.blob, record.name)
      studioNotice.value = 'Download opened. Your image stays on the shelf until you remove it.'
    } catch (error) { studioNotice.value = error.message }
  }
  async function removeOutput(id) {
    if (batchRunning.value) return
    try { await localStore.remove('outputs', id); outputs.value = outputs.value.filter(item => item.id !== id) }
    catch (error) { studioNotice.value = error.message }
  }
  return { supporter, presets, outputs, storageNotice, studioNotice, presetName, presetKind, colorOne, colorTwo, presetImage, presetSaving, batchInput, batchRunning, batchStop, batchProgress, batchErrors,
    initialize, setSupporter, savePreset, removePreset, runBatch, downloadOutput, removeOutput, disposeStudio: () => presetUrls.forEach(url => URL.revokeObjectURL(url)) }
}
