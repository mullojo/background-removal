// Durable local data. No account, photo, preset, or message is uploaded.
export function createLocalStore(factory) {
  let storageError
  // Some privacy/storage settings can throw even when reading this property.
  // Optional local features must never prevent the photo studio from mounting.
  if (factory === undefined) {
    try { factory = globalThis.indexedDB }
    catch { storageError = new Error('Local storage is blocked in this browser. Photo processing still works; saved extras need browser storage.') }
  }
  let opening
  function open() {
    if (storageError) return Promise.reject(storageError)
    if (!factory) return Promise.reject(new Error('Local storage is unavailable. Enable browser storage to use supporter features.'))
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = factory.open('cutout-local', 1)
      request.onupgradeneeded = () => {
        for (const name of ['settings', 'presets', 'outputs', 'messages']) request.result.createObjectStore(name, { keyPath: 'id' })
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => { db.close(); opening = null }
        resolve(db)
      }
      request.onerror = () => { opening = null; reject(request.error) }
      request.onblocked = () => { opening = null; reject(new Error('Close another Cutout window to finish opening local storage.')) }
    })
    return opening
  }
  async function run(name, mode, action) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode)
      const request = action(tx.objectStore(name))
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = () => reject(tx.error || new Error('Could not save locally. Storage may be full.'))
      tx.onerror = () => {} // onabort reports request errors, including quota failures.
    })
  }
  return {
    get: (name, id) => run(name, 'readonly', store => store.get(id)),
    list: name => run(name, 'readonly', store => store.getAll()),
    put: (name, value) => run(name, 'readwrite', store => store.put(value)),
    remove: (name, id) => run(name, 'readwrite', store => store.delete(id)),
  }
}
export const localStore = createLocalStore()
export async function requestPersistence() {
  try { return Boolean(await navigator.storage?.persist?.()) } catch { return false }
}
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.hidden = true
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
