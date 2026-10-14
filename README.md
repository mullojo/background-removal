# Background removal

A local browser tool for removing the background from a photo, previewing a transparent, solid-color, or gradient backdrop, and downloading a full-resolution PNG. The photo is processed in your browser. The interface uses Vue 3 and Tailwind CSS 4; inference runs in a Web Worker through Transformers.js.

**[Try the live app](https://background-removal.pages.dev/)** · **[Explore the model lab](https://background-removal-lab.pages.dev/)** — hosted on Cloudflare Pages.

This folder can stand alone now and can later sit inside a larger collection of photo and video tools. It contains only the photo background-removal project.

![Cutout with its upload canvas, loaded model, and backdrop choices](docs/images/cutout-studio.png)

*Screenshot supplied by the project owner, with the model ready and no personal photo loaded.*

## Install or reuse

The stable app is an installable PWA with a home-screen icon, standalone window,
offline interface, and automatic updates when no photo is open. Open the live app in Safari on
iPhone/iPad and choose **Share → Add to Home Screen**, or use your desktop browser's
install action when available. Model loading and photo processing still require
a connection in this release; installation does not bundle the inference runtime
or model weights. See the [PWA guide](docs/PWA.md) for behavior and testing.

To make your own version, copy `main/` to a static HTTPS host, retain the license
notices, and customize the template, colors, and editable SVG logo. No build tool
or backend is required. The manifest and service worker use relative paths so
the app can be hosted at `/` or in a subdirectory. See the
[reuse and maintenance guide](docs/REUSING.md) for the file map and update checklist.

## Versions

| Folder | Purpose | Models and runtime |
| --- | --- | --- |
| [`main/`](main/) | Current stable no-build photo app | ORMBG, Transformers.js 4.3.0; WebGPU FP16 first, WASM Q8 fallback |
| [`lab/`](lab/) | No-build comparison workbench | ORMBG and BRIA on WASM/WebGPU; MODNet on WASM; Transformers.js 4.3.0 |
| [`archive/`](archive/) | Earlier Vite editions, source, and local build snapshots | ORMBG WASM and BRIA WebGPU/WASM on Transformers.js 3.8.1 |

The root is documentation only. `main/` is the single stable app location. See the [archive index](archive/README.md) for each earlier version and its history.

## Run locally

The no-build versions need a local HTTP server for ES modules and the model worker. From this folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/main/` for the stable app or `http://127.0.0.1:8765/lab/` for comparisons. No npm install is needed for these two versions. The stable app bundles its UI libraries; model loading needs internet access for Transformers.js and model files. The lab still loads its UI libraries from CDNs. A file opened directly with `file://` will not run the worker.

### VS Code Live Server

Open `main/index.html` or `lab/index.html` with Live Server. The URL depends on the folder opened in VS Code and the server's port. If VS Code serves a parent workspace, the URL can include `Components/background-removal/main/index.html`. If it serves this repository directly, the path is `/main/index.html` or `/lab/index.html`.

Live Server serves the files without a build step. These apps use CDN libraries and downloaded model weights, so no-build does not mean fully offline. Direct `file://` access is unsupported; use Live Server, another local HTTP server, or an HTTPS host.

The model downloads are stored in the browser Cache Storage for the exact site origin. Both apps show the model cache and provide a clear button. If you serve both paths on the same host and port, they share that origin's model cache.

## Versions and releases

`VERSION` is the authoritative semantic version, beginning at **v1.0.0**. The app
shows the running version below its name, in the footer, and in diagnostics.
Versioned pushes to `main` run checks and publish a matching GitHub tag/release
with changelog notes. See [CHANGELOG.md](CHANGELOG.md) and the
[release workflow](docs/VERSIONING.md).

## Publishing notes

### Human value and gift support

This is an open source, gift-supported project. We record the human attention
and effort contributed in [human value blocks](docs/HUMAN_VALUE_BLOCKS.md):
approximately one hour per block, valued at $100 toward a voluntary support
baseline. The initial retrospective estimate through v1.0.0 is **14 blocks /
$1,400**, including **7 blocks / $700 on October 13, 2026**. These are provisional
estimates, with assumptions and ranges in the record. The app now includes bitcoin giving, portable supporter codes, saved brand
backdrops, batch processing, and a local message notebook. See the
[giving and supporter guide](docs/GIVING.md) for the flow and current limitations.

### Hosting and licensing

The stable app and comparison lab are both live at the links above. See [repository and hosting setup](docs/PUBLISHING.md) for the GitHub Desktop workflow and Cloudflare Pages settings.

The project's source is released under the [MIT License](LICENSE). Third-party libraries and model weights retain their own licenses. `main/` uses the [ORMBG ONNX model](https://huggingface.co/onnx-community/ormbg-ONNX), listed as Apache 2.0. `lab/` includes BRIA RMBG 1.4 for evaluation; its [separate license](https://huggingface.co/briaai/RMBG-1.4) restricts commercial use. See [lab model notes](lab/MODEL_NOTES.md) and [lab dependencies](lab/DEPENDENCIES.md) for the model and library details.

The Vite `dist/` folders are retained locally but ignored by Git because they are generated output. Their source and lockfiles remain available to rebuild them. `.DS_Store` and installed dependencies are also ignored.

## ORMBG model architecture

**ORMBG (Open Remove Background Model)** is a foreground segmentation model released by [schirrmacher](https://huggingface.co/schirrmacher/ormbg). Our browser app loads the [Transformers.js-ready ONNX conversion](https://huggingface.co/onnx-community/ormbg-ONNX). Both model pages currently list Apache 2.0; check the model repositories again before redistributing weights or publishing licensing claims.

The underlying neural network is **IS-Net**, from the [Highly Accurate Dichotomous Image Segmentation paper](https://www.ecva.net/papers/eccv_2022/papers_ECCV/papers/136780036.pdf). It is a convolutional, U²-Net-style encoder and decoder with nested residual U-blocks (RSUs). An initial stride-2 convolution reduces the spatial size before the encoder; the decoder combines features from several scales to recover foreground details. The IS-Net training method adds supervision on intermediate features as well as segmentation masks. A separate ground-truth encoder helps train the image segmentation network; only the image segmentation network is used for inference. ORMBG adapts this design and is [optimized for images with people](https://huggingface.co/schirrmacher/ormbg).

The `ViTFeatureExtractor` name in the [conversion's preprocessing config](https://huggingface.co/onnx-community/ormbg-ONNX/blob/main/preprocessor_config.json) is a library interface label. The model is **not a Vision Transformer**. Transformers.js is the JavaScript library that loads and runs its ONNX graph.

### From photo to PNG in this app

| Step | What happens |
| --- | --- |
| Prepare | The main app draws a 1024 × 1024 model input and a small display preview, then closes the full-resolution decoded image before transferring the input pixels to the worker. Transformers.js converts the input to RGB and rescales values to 0–1. The published preprocessing config does not apply mean/std normalization. |
| Predict | IS-Net estimates a soft foreground mask, rather than classifying the photo or generating a new image. |
| Restore size | Our worker extracts the foreground mask from the pipeline result. The app reopens the retained original file and resizes the mask to its full photo dimensions. |
| Export | The app applies the mask to the original photo with Canvas compositing, then optionally adds a selected color or gradient and creates a full-resolution PNG for download or native file sharing. |

The stable implementation lives in [`main/model.worker.js`](main/model.worker.js) and [`main/app.js`](main/app.js); the Vite edition is preserved separately in [`archive/ormbg-vite-wasm/src/`](archive/ormbg-vite-wasm/src/). The worker runs the `background-removal` pipeline on WebGPU with FP16 weights when possible. It switches to WASM with Q8 weights if GPU loading or inference fails. The corresponding [ONNX files](https://huggingface.co/onnx-community/ormbg-ONNX/tree/main/onnx) are approximately 88.1 MB and 44.3 MB. The model downloads on first use and is kept in this browser origin's Cache Storage until the user clears it. The original photo is processed in the browser.

ORMBG's upstream model card describes its human-focused training and research. Results on products, animals, transparent objects, or crowded scenes should be assessed with representative images before making quality claims. WebGPU was faster in our local comparisons, while WASM provides a fallback for unsupported or incompatible GPU paths. Performance varies by browser and device.

The stable app includes **Share / Save…**, when file sharing is supported, and **Help & diagnostics** for mobile troubleshooting. See [mobile testing notes](docs/MOBILE_TESTING.md) for capturing failures and trying WASM after an interrupted session.

### Sources and credit

- [Original ORMBG model, training notes, and license](https://huggingface.co/schirrmacher/ormbg)
- [ONNX conversion, model files, and license](https://huggingface.co/onnx-community/ormbg-ONNX)
- [IS-Net research paper by Qin et al. (ECCV 2022)](https://www.ecva.net/papers/eccv_2022/papers_ECCV/papers/136780036.pdf)
- [DIS / IS-Net research code](https://github.com/xuebinqin/DIS)
