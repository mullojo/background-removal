# Reuse and maintain Cutout

## Copy or fork

Fork the repository to keep the lab, history, and guides, or copy the entire
`main/` directory for just the stable app. Preserve `LICENSE` and the third-party
notices in `main/vendor/` when distributing a copy. Model licenses apply separately.
Deploy the copied app to a static HTTPS host. Cloudflare Pages can keep the settings
in [PUBLISHING.md](PUBLISHING.md); no build step or backend is needed.

Serve locally with `python3 -m http.server 8765 --bind 127.0.0.1`. Open `/main/`
when serving the repository, or `/` when serving `main/` directly. Relative URLs
support either layout. Use HTTP for localhost testing, HTTPS for public installs.

## Customize

| File | Change here |
| --- | --- |
| `main/index.html` | Product copy, Vue template, title, metadata, visible brand name |
| `main/style.css` | Colors, typography, spacing, responsive layout, header mark |
| `main/app.js` | Backdrop choices, image handling, export behavior |
| `main/model.worker.js` | Model ID, backend choices, inference and mask extraction |
| `main/diagnostics.js` | App version and report identity |
| `main/manifest.webmanifest` | Install name, identity, description, icons, theme |
| `main/icons/logo.svg` | Editable source for the existing terracotta frame logo |
| `main/pwa.js` | Install and update behavior |
| `main/service-worker.js` | Shell release, file list, cache ownership prefix |

The PNG install icons are raster exports of `logo.svg`. When changing the logo,
export square PNGs at 192, 512, and 180 pixels. The maskable 512-pixel icon needs
its essential artwork within the central safe circle (radius 40% of the canvas).
Keep the icon background opaque for Apple/maskable use. Replace all exports along
with the SVG. The header mark currently uses matching CSS shapes in `style.css`.

A separately branded app should get its own manifest identity, diagnostics storage
key, and shell-cache prefix. Keep an existing deployed app's identity stable across
ordinary updates. Changing models may require different preprocessing and output
handling; changing the model ID alone is not sufficient for every model.

## Release an update

1. Edit the source and update `APP_VERSION` in `main/diagnostics.js`.
2. Bump `RELEASE` in `main/service-worker.js` for every change to cached app files.
   Keep `FILES` current when adding, removing, or renaming app assets.
3. Run `node --test tests/pwa.test.cjs` with a modern Node.js runtime. These tests
   use Node's standard library and do not require npm install.
4. Serve the app, verify upload/export and mobile layout, then check the waiting
   update flow. Service workers can keep an older version visible during development;
   use the app's update action or browser developer tools to reset your local shell.
5. Capture new screenshots if the interface changed. The owner's README image
   lives at `docs/images/cutout-studio.png`; `cutout-desktop.jpg` and
   `cutout-mobile.jpg` record the PWA layout. These are actual browser screenshots
   without a personal photo loaded.
6. Commit and push. Wait for Pages, then check the reported app version and retest
   on the target phone. See [PWA.md](PWA.md) and [MOBILE_TESTING.md](MOBILE_TESTING.md).

Vue/Tailwind are pinned local copies with upstream MIT notices. See
[`main/vendor/README.md`](../main/vendor/README.md) before updating them.
Transformers.js remains pinned to a remote CDN version in the model worker.
