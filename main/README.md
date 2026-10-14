# Cutout — main no-build app

**[Open the live app](https://background-removal.pages.dev/)** · [MIT License](../LICENSE)

The stable no-build Cutout app, with these editable implementation files:

- `index.html` — the Vue template, manifest, and library links
- `style.css` — the original design styles
- `app.js` — Vue 3 application state and image export
- `giving.js` and `giving-ui.js` — Bitcoin requests, portable codes, and giving/message UI
- `supporter-studio.js` — saved brand backdrops and sequential batch processing
- `local-store.js` — IndexedDB storage and local downloads
- `model.worker.js` — Transformers.js model loading and inference
- `diagnostics.js` — bounded local processing logs and recovery after an interrupted session
- `version.js` — generated from the repository VERSION file
- `pwa.js` — install, connectivity, and update controls
- `service-worker.js` — versioned offline app shell
- `manifest.webmanifest` and `icons/` — app identity and editable SVG logo
- `vendor/` — pinned Vue, Tailwind, and QR Code Styling runtimes with upstream licenses

No npm install, bundler, compilation, or build command is needed. Vue 3 and Tailwind CSS 4 are bundled locally. Transformers.js and the ORMBG model load remotely. Photos are processed locally in the browser.

The app can be installed on a home screen or desktop and reopen its interface
offline after the shell is cached. Updates apply automatically when no photo is
open. The running version is visible under the Cutout name and in the footer.
Connect to load the model and process photos.
See [PWA behavior and testing](../docs/PWA.md) and [reuse instructions](../docs/REUSING.md).

## Run

From VS Code, open `main/index.html` with Live Server. Alternatively, from the project root:

```bash
cd main  # from the project root
python3 -m http.server 8766 --bind 127.0.0.1
```

Open `http://127.0.0.1:8766`. Browser modules and workers require local HTTP, so opening `index.html` with `file://` will not work.

The model is cached in the browser's Cache Storage for this origin. The **Model Storage** panel shows the cache location, file count, and size, and provides a button to clear it. The port is part of the origin, so running on a different port uses a separate model cache.

Model: [onnx-community/ormbg-ONNX](https://huggingface.co/onnx-community/ormbg-ONNX), Apache 2.0. The app uses Transformers.js **4.3.0**. It first tries **WebGPU with FP16** weights (about 88.1 MB). If WebGPU is absent or fails during loading or processing, it retries with **WASM and Q8** weights (about 44.3 MB). The status panel shows which engine loaded. A fallback downloads a separate model file on first use. Earlier Vite editions are indexed in [`../archive/README.md`](../archive/README.md).

The model loads automatically when the page opens. A photo selected while loading
waits until the model is ready before it is decoded. Only the latest waiting photo
is retained. Changing photos releases the previous previews and image resources
before loading a fresh model session for the next one. The pipeline is disposed
after each inference and its worker is terminated before full-resolution export.
Downloaded weights stay cached, but each photo pays model initialization time.
Clearing the
model cache leaves it empty until the next upload or **Load model** action.

For the model architecture and the browser processing flow, see the [main project README](../README.md#ormbg-model-architecture).

## Image controls

After processing, **Compare original** toggles between the source photo and the
cutout with a tap or keyboard activation. The pressed button and BEFORE/AFTER
badge show which view is active. **Change image** chooses another photo using the
same fresh-worker flow. **Start over** clears the photo and its preview/export
resources and resets the backdrop to transparent; downloaded model files remain
cached. Controls wait until processing/export/sharing finishes. The filename is
shown as a small caption below the main controls.

[Desktop toolbar](../docs/images/cutout-toolbar-desktop.jpg) · [Phone toolbar](../docs/images/cutout-toolbar-mobile.jpg)

## Giving and supporter extras

**Give & grow** opens the Bitcoin giving dialog. Gifts of $10 USD or more open
saved color/gradient/image backdrops, batches of up to 20 photos, and a local
message notebook with optional diagnostics. Gift recovery/supporter codes can be
saved, copied, and restored; the upgrade and finished batch PNGs use IndexedDB.
Messages stay local and are not delivered yet. Codes use an unsigned honor system.
See the [giving guide](../docs/GIVING.md) for payment matching, storage limits,
privacy, and phone testing.

## Mobile saving and troubleshooting

**Download image** saves the selected PNG. On browsers that support sharing image files, **Share / Save…** opens the native share sheet. On iPhone, choose **Save Image** to save to Photos when that action is available. The shared file includes the selected transparent, solid-color, gradient, or saved image background.

Open **Help & diagnostics → Copy diagnostics** to copy browser details, image dimensions/type/size, processing stages, backend, mask alpha statistics, and captured errors. Photos and filenames are not included. Recent steps are stored locally in this browser, so an unfinished earlier session can be included after reopening the page. A full browser process crash may not deliver a JavaScript error; the last recorded stage helps narrow it down. Nothing is sent automatically.

Use **Stop processing** if a run stalls. After a handled error, **Retry with WASM** reloads the model on the CPU backend. After a full-page crash, reopen the page and enable **Use WASM for the next run** under diagnostics before choosing the image again. This option lasts for the current page session.

To reduce memory use, the app sends a 1024 × 1024 pixel buffer to the worker and limits display previews to a 1280-pixel longest edge. It closes the full-resolution decoded photo before inference, then decodes the retained original file again to apply the returned mask for export. The downloaded/shared PNG retains the original photo dimensions. Very large photos and device/runtime limits can still cause failures. See [mobile testing notes](../docs/MOBILE_TESTING.md).

Version `2026-10-13-mobile-4` gives every photo a fresh model worker, including
photos selected through **Change image**, drag/drop, queued selection, or WASM retry.
Diagnostics include `worker-created`, `worker:model-disposed`, and `worker-released`
events to check that cleanup happened before export and the next run.

## Releases

Use the repository's [versioning workflow](../docs/VERSIONING.md): bump with
`node scripts/release.mjs patch|minor|major`, complete CHANGELOG.md, check, commit,
and push. `VERSION` drives the app, shell cache, and GitHub release tag.
