# Background removal model lab: milestone and dependencies

Milestone recorded 2026-10-06. This document describes the `lab/` no-build image lab. It is a snapshot for a possible future repository, not a release announcement.

## What the app does

Upload one photo, run a background-removal model in the browser, compare cutouts and inference times, choose a solid color or gradient, and download a full-resolution PNG. The image processing code runs locally in a module Web Worker. The app has no image-processing server, account system, build step, npm install, or package lockfile.

Run it from this directory with a local server:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. Python is only a convenient static server for development; it is not an application dependency. A published site can serve these static files over HTTPS.

## Direct browser dependencies

| Dependency | Version used here | Loaded from | Role | License |
| --- | --- | --- | --- | --- |
| [Vue](https://github.com/vuejs/core) | 3.5.43 | `https://unpkg.com/vue@3.5.43/dist/vue.esm-browser.prod.js` in `app.js` | Reactive interface and component template | [MIT](https://github.com/vuejs/core/blob/main/LICENSE) |
| [Tailwind CSS browser package](https://tailwindcss.com/docs/installation/play-cdn) | 4.3.3 | `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3` in `index.html` | Browser-loaded styling support | [MIT](https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE) |
| [Transformers.js](https://github.com/huggingface/transformers.js) | 4.3.0 | `https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0` in `model.worker.js` | Model loading, preprocessing, ONNX inference, WASM and WebGPU execution | [Apache 2.0](https://github.com/huggingface/transformers.js/blob/main/LICENSE) |
| [DM Sans](https://fonts.google.com/specimen/DM+Sans) and [DM Serif Display](https://fonts.google.com/specimen/DM+Serif+Display) | Google Fonts hosted styles | `fonts.googleapis.com` import in `style.css` | Interface typography | [OFL: DM Sans](https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt), [OFL: DM Serif Display](https://github.com/google/fonts/blob/main/ofl/dmserifdisplay/OFL.txt) |

Transformers.js supplies its ONNX Runtime browser integration and supporting WASM/WebGPU assets; this app does not import ONNX Runtime directly. The CDN URLs pin the three JavaScript packages to named releases, but a future reproducible release should also record the resolved model revisions and external asset versions. The visual design is mainly in the local `style.css` file.

## Model downloads and modes

| Model | Selected mode | Approximate ONNX weight download | Model license | Place in this lab |
| --- | --- | --- | --- | --- |
| [ORMBG](https://huggingface.co/onnx-community/ormbg-ONNX) | WASM Q8; WebGPU FP16 | [44.3 MB; 88.1 MB](https://huggingface.co/onnx-community/ormbg-ONNX/tree/main/onnx) | Apache 2.0 | General cutout comparison; default model |
| [BRIA RMBG 1.4](https://huggingface.co/briaai/RMBG-1.4) | WASM Q8; WebGPU FP16 | [44.4 MB; 88.2 MB](https://huggingface.co/briaai/RMBG-1.4/tree/main/onnx) | BRIA RMBG 1.4, non-commercial | Quality comparison and experimentation |
| [MODNet](https://huggingface.co/Xenova/modnet) | WASM FP32 | [25.9 MB](https://huggingface.co/Xenova/modnet/tree/main/onnx) | Apache 2.0 | Fast portrait matting option |

The sizes are model weights, not the complete first-visit network transfer. ORMBG and MODNet use the Transformers.js `background-removal` pipeline. BRIA uses `AutoModel`, `AutoProcessor`, and `RawImage` directly because the v4.3.0 `image-segmentation` pipeline rejects this model's `SegformerForSemanticSegmentation` type in this lab. The BRIA output is normalized to a grayscale mask before compositing. Every model produces a mask that the app applies to the original image using Canvas 2D, then exports as PNG.

The two backends are explicit choices. WASM works without WebGPU. WebGPU requires a browser and device that expose it; a visible WebGPU option can still fail during model loading or inference on a particular system. MODNet remains on FP32/WASM because its tested WebGPU FP16 and FP32 results had similar mask artifacts. BEN2 was removed from this lab after a WebGPU shader error and very long retry; see [MODEL_NOTES.md](MODEL_NOTES.md) for the experiment history.

## Browser features and data flow

The app uses ES modules, a module Web Worker, File input and drag/drop, `createImageBitmap`, Canvas 2D, object URLs, Cache Storage, WebAssembly, and optional WebGPU. `navigator.gpu` controls availability of the WebGPU choices. The photo is read from the user's file selection and passed to the worker through a local object URL. Model files, JavaScript, and fonts are fetched from their providers; the app code does not upload the photo to a server.

Downloaded model assets are kept in the browser's Cache Storage under `transformers-cache` for the site's origin. The interface reports the cached file count and estimated size and provides a **Clear all model caches** button. Clearing that cache removes those cached model downloads for the origin; other browser HTTP caches may remain. Cutouts are held in memory for the current page session and are cleared when a new photo is uploaded or the page reloads.

## Milestone observation

One local portrait test shown in the lab on 2026-10-06 reported these inference times:

| Option | Inference time |
| --- | ---: |
| ORMBG WASM Q8 | 7.4 s |
| ORMBG WebGPU FP16 | 5.2 s |
| BRIA WASM Q8 | 7.4 s |
| BRIA WebGPU FP16 | 4.8 s |
| MODNet WASM FP32 | 0.9 s |

These times exclude model download/loading and final PNG compositing. They are observations for one photo on one machine, not a benchmark or a promise of relative speed on other hardware. MODNet is the quick portrait option in this test; ORMBG and BRIA offered visually strong alternatives.

## Publication notes

The app's own source has no project license file in this folder yet; choose one before publishing a repository. Vue, Tailwind, Transformers.js, ORMBG, and MODNet have the licenses linked above. BRIA's [model card](https://huggingface.co/briaai/RMBG-1.4) says the model is source-available for non-commercial use and requires a separate commercial agreement for commercial use. Publishing the code and offering a funded service are different decisions; review BRIA's terms and decide whether to exclude that model from a public or gift-supported release.

For a repeatable release, capture the exact model repository revisions, run the five options on representative photos and browsers, and check the actual network and cache behavior after deployment. The present document records the working local milestone.
