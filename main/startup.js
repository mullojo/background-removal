// A framework-independent safety net: module/storage failures must not leave
// only the page background. No photo, account, or model data is cleared here.
;(() => {
  const status = document.getElementById('startup-status')
  const title = document.getElementById('startup-title')
  const message = document.getElementById('startup-message')
  const details = document.getElementById('startup-details')
  const report = document.getElementById('startup-report')
  let finished = false
  let failed = false
  const waiting = setTimeout(() => { if (!finished) status.hidden = false }, 2500)

  document.getElementById('startup-retry').addEventListener('click', () => window.location.reload())
  report.addEventListener('focus', () => report.select())

  function failedToStart(cause) {
    if (finished || failed) return
    failed = true
    clearTimeout(waiting)
    status.hidden = false
    title.textContent = 'Cutout couldn’t open'
    message.textContent = 'Please try again. If this keeps happening, share the startup details below so we can help.'
    details.hidden = false
    report.value = JSON.stringify({
      app: 'Cutout', stage: 'startup', time: new Date().toISOString(),
      path: window.location.pathname, userAgent: navigator.userAgent,
      message: String(cause?.message || cause || 'Unknown startup error'),
      stack: String(cause?.stack || '').slice(0, 3000),
    }, null, 2)
    console.error('[Cutout startup]', cause)
  }
  function startupError(event) { failedToStart(event.error || event.reason || event.message) }
  window.addEventListener('error', startupError)
  window.addEventListener('unhandledrejection', startupError)

  import('./app.js').then(() => {
    if (!document.querySelector('#app main')) throw new Error('The photo studio did not render. Check Safari’s console for the underlying render error.')
    finished = true
    clearTimeout(waiting)
    status.hidden = true
    window.removeEventListener('error', startupError)
    window.removeEventListener('unhandledrejection', startupError)
  }).catch(failedToStart)
})()
