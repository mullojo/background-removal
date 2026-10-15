import { ref } from './vendor/vue-3.5.43.esm-browser.prod.js'

// TEMPORARY: remove this module and its app/template wiring after feature testing.
// Session storage is deliberately separate from real gifts and supporter receipts.
const KEY = 'cutout-preview-supporter'

export function useDeveloperPreview({ isBusy, onChange }) {
  const developerTools = ref(false)
  const previewSupporter = ref(false)
  let taps = 0
  let lastTap = 0

  function revealDeveloperTools() {
    const now = Date.now()
    taps = now - lastTap > 5000 ? 1 : taps + 1
    lastTap = now
    if (taps < 7) return
    taps = 0
    developerTools.value = !developerTools.value
  }

  function setPreviewSupporter(enabled) {
    if (isBusy()) return
    previewSupporter.value = Boolean(enabled)
    try {
      if (previewSupporter.value) window.sessionStorage.setItem(KEY, '1')
      else window.sessionStorage.removeItem(KEY)
    } catch {
      // Restricted storage still permits a preview for the current page.
    }
    onChange()
  }

  function initializeDeveloperPreview() {
    try {
      if (window.sessionStorage.getItem(KEY) === '1') {
        developerTools.value = true
        setPreviewSupporter(true)
      }
    } catch {
      // Normal app use never depends on developer preferences being available.
    }
  }

  return {
    developerTools,
    previewSupporter,
    revealDeveloperTools,
    setPreviewSupporter,
    initializeDeveloperPreview,
  }
}
