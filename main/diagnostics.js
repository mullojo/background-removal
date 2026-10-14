export const APP_VERSION = '2026-10-13-mobile-4'
const STORAGE_KEY = 'cutout-diagnostics-v1'

export function createDiagnostics() {
  let stored
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { /* Storage may be unavailable. */ }
  const previous = stored?.active ? { ...stored, interrupted: undefined } : stored?.interrupted || null
  const state = {
    version: APP_VERSION,
    started: new Date().toISOString(),
    active: false,
    stage: 'idle',
    image: null,
    events: [],
  }
  function record(event, details = {}, changes = {}) {
    Object.assign(state, changes)
    const entry = { time: new Date().toISOString(), event, ...details }
    state.events.push(entry)
    state.events = state.events.slice(-60)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, interrupted: previous })) } catch { /* Diagnostics remain available in memory. */ }
    console.info('[Cutout]', entry)
  }
  function report(current = {}) {
    return JSON.stringify({
      app: 'Cutout',
      runtime: 'Transformers.js 4.3.0',
      model: 'onnx-community/ormbg-ONNX',
      environment: {
        userAgent: navigator.userAgent,
        secureContext: window.isSecureContext,
        online: navigator.onLine,
        standalone: window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true,
        webgpuExposed: Boolean(navigator.gpu),
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemoryGB: navigator.deviceMemory || null,
        screen: { width: screen.width, height: screen.height, pixelRatio: window.devicePixelRatio },
      },
      current,
      session: state,
      previousInterruptedSession: previous,
    }, null, 2)
  }
  return { record, report, previous }
}
