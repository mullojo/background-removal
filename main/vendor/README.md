# Bundled UI runtimes

Pinned copies make the PWA interface independent of a CDN. These files require no
build step. Preserve the upstream license notices when copying this project.

| File | Source | License |
| --- | --- | --- |
| `vue-3.5.43.esm-browser.prod.js` | https://unpkg.com/vue@3.5.43/dist/vue.esm-browser.prod.js | MIT, `VUE-LICENSE.txt` |
| `qr-code-styling-1.9.2.js` | https://cdn.jsdelivr.net/npm/qr-code-styling@1.9.2/lib/qr-code-styling.js | MIT, `QR-CODE-STYLING-LICENSE.txt`; bundled qrcode-generator, `QRCODE-GENERATOR-LICENSE.txt` |
| `tailwind-browser-4.3.3.js` | https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3 | MIT, `TAILWIND-LICENSE.txt` |

To update, download the intended pinned release and its license, update the HTML
or module import and the service worker's file list, then prepare a version bump
with `node scripts/release.mjs patch` from the repository root.
Transformers.js and model weights remain remote and are not bundled here.
