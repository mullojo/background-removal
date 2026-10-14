export function createPwa({ onChange, onDiagnostic, isBusy, hasImage = () => false }) {
  let prompt = null
  let registration = null
  let activationRequested = false
  let reloadPending = false
  let reloaded = false
  let hadController = Boolean(navigator.serviceWorker?.controller)
  let lastCheck = 0
  let checking = false
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
  function connectivity() { state.offline = !navigator.onLine; publish(); if (!state.offline) checkForUpdates() }
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
    // First installation claims the page without needing a reload.
    if (hadController || activationRequested) reloadPending = true
    hadController = true
    state.updateAvailable = reloadPending
    publish()
    tryUpdate()
  }
  function waiting() {
    state.updateAvailable = reloadPending || Boolean(registration?.waiting && navigator.serviceWorker.controller)
    publish()
    tryUpdate()
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
  function tryUpdate() {
    if (disposed || reloaded || isBusy() || hasImage()) return
    if (reloadPending) {
      reloaded = true
      onDiagnostic('pwa-auto-reload')
      window.location.reload()
    } else if (!activationRequested && registration?.waiting && navigator.serviceWorker.controller) {
      activationRequested = true
      onDiagnostic('pwa-auto-activate')
      registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' })
    }
  }
  async function checkForUpdates() {
    if (disposed || !registration || checking || !navigator.onLine || document.visibilityState === 'hidden' || Date.now() - lastCheck < 60000) return
    checking = true
    lastCheck = Date.now()
    try { await registration.update() }
    catch (error) { onDiagnostic('pwa-update-check-error', { message: String(error.message || error) }) }
    finally { checking = false }
    if (!disposed) { waiting(); tryUpdate() }
  }
  function returnedToApp() {
    if (document.visibilityState === 'hidden') return
    tryUpdate()
    checkForUpdates()
  }
  window.addEventListener('beforeinstallprompt', beforeInstall)
  window.addEventListener('appinstalled', installed)
  window.addEventListener('online', connectivity)
  window.addEventListener('offline', connectivity)
  window.addEventListener('focus', returnedToApp)
  document.addEventListener('visibilitychange', returnedToApp)
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
        checkForUpdates()
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
  const checkTimer = setInterval(returnedToApp, 5 * 60 * 1000)
  checkTimer?.unref?.()
  return { install, tryUpdate, dispose() {
    disposed = true
    clearInterval(checkTimer)
    window.removeEventListener('beforeinstallprompt', beforeInstall)
    window.removeEventListener('appinstalled', installed)
    window.removeEventListener('online', connectivity)
    window.removeEventListener('offline', connectivity)
    window.removeEventListener('focus', returnedToApp)
    document.removeEventListener('visibilitychange', returnedToApp)
    display.removeEventListener('change', displayChanged)
    navigator.serviceWorker?.removeEventListener('controllerchange', controllerChanged)
    registration?.removeEventListener('updatefound', updateFound)
    installing?.removeEventListener('statechange', workerChanged)
  } }
}
