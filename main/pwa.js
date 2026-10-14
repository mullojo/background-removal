export function createPwa({ onChange, onDiagnostic, isBusy }) {
  let prompt = null
  let registration = null
  let reloadRequested = false
  let disposed = false
  let installing = null
  const display = window.matchMedia('(display-mode: standalone)')
  const state = {
    installed: display.matches || navigator.standalone === true,
    installable: false,
    offline: !navigator.onLine,
    updateAvailable: false,
    supported: 'serviceWorker' in navigator && window.isSecureContext,
    offlineReady: Boolean(navigator.serviceWorker?.controller),
    message: '',
  }
  const publish = () => { if (!disposed) onChange({ ...state }) }
  function connectivity() { state.offline = !navigator.onLine; publish() }
  function displayChanged() { state.installed = display.matches || navigator.standalone === true; publish() }
  function beforeInstall(event) {
    event.preventDefault()
    prompt = event
    state.installable = true
    publish()
  }
  function installed() {
    prompt = null
    state.installable = false
    state.installed = true
    state.message = 'Cutout is installed.'
    publish()
  }
  function controllerChanged() {
    state.offlineReady = Boolean(navigator.serviceWorker.controller)
    publish()
    if (reloadRequested) window.location.reload()
  }
  function waiting() {
    state.updateAvailable = Boolean(registration?.waiting && navigator.serviceWorker.controller)
    publish()
  }
  function workerChanged() {
    if (installing?.state === 'installed') waiting()
    if (installing?.state === 'redundant' && !state.offlineReady) {
      state.message = 'Offline setup did not finish. Reopen online to try again.'
      publish()
    }
  }
  function updateFound() {
    installing?.removeEventListener('statechange', workerChanged)
    installing = registration.installing
    installing?.addEventListener('statechange', workerChanged)
  }
  async function install() {
    if (!prompt) return
    const current = prompt
    prompt = null
    state.installable = false
    publish()
    try {
      await current.prompt()
      const choice = await current.userChoice
      onDiagnostic('pwa-install-choice', { outcome: choice.outcome })
    } catch (error) {
      state.message = 'Use your browser’s install menu to add Cutout.'
      onDiagnostic('pwa-install-error', { message: String(error.message || error) })
    }
    publish()
  }
  function update() {
    if (isBusy() || !registration?.waiting) return
    reloadRequested = true
    registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' })
  }
  window.addEventListener('beforeinstallprompt', beforeInstall)
  window.addEventListener('appinstalled', installed)
  window.addEventListener('online', connectivity)
  window.addEventListener('offline', connectivity)
  display.addEventListener('change', displayChanged)
  publish()
  if (state.supported) {
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged)
    navigator.serviceWorker.register(new URL('./service-worker.js', import.meta.url), { updateViaCache: 'none' })
      .then(value => {
        if (disposed) return
        registration = value
        waiting()
        registration.addEventListener('updatefound', updateFound)
        updateFound()
        onDiagnostic('pwa-registered', { scope: registration.scope })
        navigator.serviceWorker.ready.then(() => {
          state.offlineReady = true
          publish()
        })
      }).catch(error => {
        state.message = 'Offline setup could not start. Reopen online to try again.'
        onDiagnostic('pwa-registration-error', { message: String(error.message || error) })
        publish()
      })
  }
  return { install, update, dispose() {
    disposed = true
    window.removeEventListener('beforeinstallprompt', beforeInstall)
    window.removeEventListener('appinstalled', installed)
    window.removeEventListener('online', connectivity)
    window.removeEventListener('offline', connectivity)
    display.removeEventListener('change', displayChanged)
    navigator.serviceWorker?.removeEventListener('controllerchange', controllerChanged)
    registration?.removeEventListener('updatefound', updateFound)
    installing?.removeEventListener('statechange', workerChanged)
  } }
}
