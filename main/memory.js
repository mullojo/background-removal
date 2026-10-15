// These are application-owned RGBA buffer estimates, not total process RAM.
// GPU drivers, the model runtime, codecs, JS objects, and browser caches add more.
export function createMemoryTracker(onChange = () => {}) {
  const images = new Map()
  let peakImageBytes = 0
  function snapshot() {
    const imageBytes = [...images.values()].reduce((total, bytes) => total + bytes, 0)
    return { imageBytes, peakImageBytes, imageResources: images.size }
  }
  function track(image) {
    images.set(image, image.width * image.height * 4)
    const current = snapshot()
    peakImageBytes = Math.max(peakImageBytes, current.imageBytes)
    onChange(snapshot())
    return image
  }
  function release(image) {
    images.delete(image)
    onChange(snapshot())
  }
  return { track, release, snapshot }
}

export function browserMemory(environment = globalThis) {
  // Feature-detect: iPhone Safari exposes neither of these values. Heap readings
  // in Chromium omit allocations such as GPU buffers and separate worker heaps.
  let heap = null, deviceGB = null
  try {
    const memory = environment.performance?.memory
    if (memory && Number.isFinite(memory.usedJSHeapSize) && Number.isFinite(memory.jsHeapSizeLimit)) {
      heap = { usedBytes: memory.usedJSHeapSize, limitBytes: memory.jsHeapSizeLimit }
    }
    const reported = environment.navigator?.deviceMemory
    if (Number.isFinite(reported) && reported > 0) deviceGB = reported
  } catch { /* Restricted browser contexts still show app-owned estimates. */ }
  return { heap, deviceGB, availableRamBytes: null, systemPressure: null }
}
export const memoryMB = bytes => `${(bytes / 1048576).toFixed(1)} MB`
