# Cutout as a PWA

The stable `main/` app has a relative-path web manifest, 192/512-pixel install
icons, a maskable icon, a 180-pixel Apple touch icon, standalone display, and a
versioned service worker. `lab/` remains a separate comparison app.

[Desktop PWA screenshot](images/cutout-desktop.jpg) · [Mobile layout screenshot](images/cutout-mobile.jpg)

## Install and use

1. Open the HTTPS stable app in your browser while connected.
2. Wait for **Offline interface ready** in the install section.
3. On iPhone/iPad, use Safari's **Share → Add to Home Screen** flow. On a supporting
   desktop/Android browser, use **Install Cutout** when offered or the browser's
   install menu. The app does not force an install prompt on startup.
4. Launch Cutout from its new icon. Supporting browsers open it in its own window.

The manifest follows [web.dev's manifest guidance](https://web.dev/learn/pwa/web-app-manifest)
and [MDN's installability guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
Install availability and menu wording vary by browser. In-app browsers may not
offer installation even when they can display the app.

## Offline scope

The service worker caches only the app's own listed files, including the bundled
Vue/Tailwind runtimes. The interface can reopen without the origin server after
successful caching. Fonts may fall back to system fonts offline.

This release requires a connection to start model loading and process photos.
Transformers.js, its runtime dependencies, and model weights are not included in
the offline shell. Downloaded weights remain in Transformers.js's separate
`transformers-cache`; having weights cached is not a guarantee of offline inference.
An offline launch waits for connectivity before starting the model worker. A
waiting upload stays in memory on the device and resumes when connectivity returns.
Closing/reloading the app discards that waiting file.

Photos, exported PNGs, and filenames are not saved by the service worker. Existing
diagnostics remain local in this site's local storage. Browser storage can be
evicted, and an installed app's storage may differ from the original browser tab.

## Updates and storage

Updates precache a complete new shell, then apply automatically when no photo
is open and processing/sharing has finished. If a photo is present, the app waits
until **Start over** or a later launch so an update cannot discard your result.
Other open windows also defer reloading while they hold a photo. Checks run on
launch, reconnection, return to the app, and every five minutes while visible
and online. There is no update button in the new UI. See [VERSIONING.md](VERSIONING.md)
for the first-upgrade transition and GitHub release workflow.

Activation deletes only older Cutout shell caches for that scope. It leaves model
and unrelated app caches alone. **Clear model cache** clears model downloads;
it does not remove the installed shell. See
[MDN's service worker lifecycle guide](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Test on a device

- Check the icon and standalone launch after installation.
- Compare upload, backdrop changes, PNG download, and Share / Save against a normal tab.
- After **Offline interface ready**, go offline and relaunch. The interface should
  appear with a connection message; it should not claim that the model is loaded.
- Reconnect with a selected photo waiting. It should load the model before decoding.
- After a later release, save any current PNG and choose **Start over**; a waiting
  update should apply automatically. Check the header version. Copy diagnostics includes connectivity, standalone,
  and PWA readiness information.

For local testing use `localhost`/`127.0.0.1`. A phone's HTTP LAN URL does not provide
the secure context needed for service workers; use the HTTPS deployment instead.

## Verification in this release

Earlier PWA checks verified rendering, model loading, installation readiness, and
the shell reopening with its local origin server stopped. For v1.0.0, an isolated
browser fixture automatically advanced from a test v1.0.0 to v1.0.1 without a
button. A later test v1.0.2 left an open result and its download link intact, then
loaded automatically after Start over. These fixture versions did not change the
repository's actual v1.0.0 release.

Automated tests cover root/subdirectory routing, cache isolation, safe automatic
activation/reload, connectivity/install events, and manifest/icon sizes. Existing
image lifecycle/export checks continue to pass. Physical iPhone automatic-update
behavior and the first GitHub publishing run still need confirmation after push.
