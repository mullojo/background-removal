// Online-only escape hatch. Neither this page nor this script is precached:
// even older service workers pass these new URLs through to the network.
// Refresh only this scope's disposable UI cache. Never touch IndexedDB or models.
;(() => {
  const button = document.getElementById('recover-button')
  const status = document.getElementById('recover-status')
  const details = document.getElementById('recover-details')
  const report = document.getElementById('recover-report')
  report.addEventListener('focus', () => report.select())
  button.addEventListener('click', async () => {
    button.disabled = true
    status.hidden = false
    status.textContent = 'Checking the connection…'
    details.hidden = true
    try {
      if (navigator.onLine === false) throw new Error('Connect to the internet, then try again.')
      const scope = new URL('./', window.location.href)
      // This URL is outside every shell's precache list. Verify a real network
      // response before removing the working offline interface.
      const response = await fetch(new URL('recover.html', scope), { cache: 'no-store' })
      if (!response.ok || !(await response.text()).includes('data-cutout-recovery')) throw new Error('Could not reach Cutout. Check your connection and try again.')
      status.textContent = 'Refreshing the app files…'
      const service = navigator.serviceWorker
      if (service?.getRegistrations) {
        const registrations = await service.getRegistrations()
        for (const registration of registrations) {
          if (registration.scope === scope.href && !await registration.unregister()) throw new Error('Could not refresh the installed app. Close other Cutout tabs and try again.')
        }
      }
      if (window.caches) {
        const prefix = `cutout-shell:${scope.pathname}:`
        const names = await window.caches.keys()
        for (const name of names) if (name.startsWith(prefix)) await window.caches.delete(name)
      }
      status.textContent = 'Opening a fresh Cutout…'
      const destination = new URL('./', scope)
      destination.searchParams.set('recovered', '1')
      window.location.replace(destination.href)
    } catch (error) {
      status.textContent = 'We couldn’t refresh the app yet. Please try again.'
      details.hidden = false
      report.value = JSON.stringify({ stage: 'recovery', message: String(error.message || error), userAgent: navigator.userAgent }, null, 2)
      button.disabled = false
    }
  })
})()
