// Generated release value; bump VERSION with scripts/release.mjs.
const RELEASE = '1.2.0'
const PREFIX = `cutout-shell:${new URL(self.registration.scope).pathname}:`
const CACHE = `${PREFIX}${RELEASE}`
const FILES = [
  './', './index.html', './style.css', './app.js', './diagnostics.js', './pwa.js',
  './giving.js', './giving-ui.js', './qr-loader.js', './developer-preview.js', './local-store.js', './supporter-studio.js', './vendor/qr-code-styling-1.9.2.js',
  './model.worker.js', './version.js', './manifest.webmanifest', './icons/logo.svg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './vendor/vue-3.5.43.esm-browser.prod.js',
  './vendor/tailwind-browser-4.3.3.js',
]
const URLS = FILES.map(path => new URL(path, self.registration.scope).href)

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll(URLS.map(url => new Request(url, { cache: 'reload' })))
  })())
  // The page activates ready updates automatically when its image session is empty.
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting()
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  url.search = ''
  if (!URLS.includes(url.href)) return
  // Only app files: no photos, blob URLs, model downloads, or third-party caches.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    return await cache.match(url.href) || fetch(event.request)
  })())
})
