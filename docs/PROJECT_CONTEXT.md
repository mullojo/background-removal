# Project context — October 13, 2026

Recovered from the earlier Codex chat titled “Background Removal”, current source,
repository history, project guides, and the latest user-supplied diagnostics.
This records the starting point for the replacement chat; it is not a new release.

## Product and structure

Cutout is a browser-local photo background remover: upload a photo, see processing
progress, preview transparency or a solid/gradient backdrop, and export a
full-resolution PNG. Photos stay on the device. Model cache visibility and clearing
are part of the intended experience. Vue 3 and Tailwind CSS 4 are the chosen UI stack.

- `main/`: stable no-build app; five editable implementation files: `index.html`,
  `style.css`, `app.js`, `model.worker.js`, and `diagnostics.js`.
- `lab/`: separate no-build comparison workbench for ORMBG and BRIA on WASM/WebGPU,
  plus MODNet WASM. BRIA is experimental with separate licensing restrictions.
- `archive/`: earlier Vite implementations; preserve as history.
- Repository: https://github.com/mullojo/background-removal
- Stable demo recorded in project docs: https://background-removal.pages.dev/
- Lab demo recorded in project docs: https://background-removal-lab.pages.dev/

Both Pages projects deploy from the repository's `main` branch, with `main` or `lab`
as the output directory and `exit 0` as the build command. The established workflow
is to prepare local commits, then have the user push through GitHub Desktop.
Demo deployments were not independently rechecked during this context review.
Source is MIT licensed; dependencies and model weights have separate licenses.
Bitcoin gift support/QR and possible future video work remain future scope.

## Confirmed implementation baseline

At review, HEAD was `16d173d` (Reduce full-resolution image memory during inference),
on branch `main`, matching the local `origin/main` reference, with a clean working
tree. No remote fetch was performed. App version is `2026-10-13-mobile-2`.

Transformers.js 4.3.0 runs ORMBG in a Web Worker. The stable app tries WebGPU FP16
first and falls back to WASM Q8 on handled GPU loading/inference errors. The model
is cached per origin in `transformers-cache`; a cached download is distinct from
a model loaded into a live worker. Page startup creates a worker but does not
automatically call `loadModel()`.

The app prepares a 1024 × 1024 inference input and previews with a maximum 1280-pixel
longest edge. It closes the full-resolution bitmap before inference and decodes
the retained source file again for full-resolution export. Existing cleanup revokes
URLs, closes bitmaps, and releases canvases; further cleanup work must account for
what already exists. Share / Save, cancellation, WASM retry, and locally persisted
diagnostics are implemented. Diagnostics omit photos and filenames.

## Current problem and unfinished request

iPhone Safari intermittently interrupts during WebGPU inference or shows an
incomplete-looking result. Earlier logs showed a 24.5 MP interruption and a 12.2 MP
success. Memory reductions were implemented and locally checked, but do not prove
the native crash cause or a complete device fix.

The latest pasted report is from `mobile-2`: the same 698 × 1467 PNG interrupted
after inference started when model loading followed image preparation, then
completed after manually loading the model first. Successful inference took
1699 ms, with full-size transparent and white PNG exports. Both runs recorded
release of the original bitmap before inference. Large-photo memory alone therefore
does not explain all observed failures. Preloading correlates with success in this
report but is not yet a proven fix.

The user's last request in the earlier chat was to make preloading the default and
clear previous image memory before changing images. The interrupted assistant turn
also proposed waiting for model readiness before image preparation and recording
mask statistics to distinguish incomplete masks from interrupted processing.
That turn contains investigation and commentary, but no implementation changes;
these proposals remain unfinished. Physical iPhone retesting remains necessary.

Read `MOBILE_TESTING.md` for diagnostics and verification limits, `PUBLISHING.md`
for deployment, and the root/main/lab READMEs for usage and model history.

## Replacement chat implementation

The replacement chat implemented the pending work as `2026-10-13-mobile-3`:
automatic loading on page open; uploads waiting for model readiness before decode;
previous previews detached before decoding another photo; queued WASM preference
preserved; preload failures retaining a source for WASM retry; and mask alpha
statistics in diagnostics. Local simulated-worker/native-Canvas checks passed for
these flows and full-resolution PNG export. This supersedes the unfinished status
above. Actual iPhone/model execution remains to be retested after deployment.
