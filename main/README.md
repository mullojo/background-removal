# Cutout — main no-build app

**[Open the live app](https://background-removal.pages.dev/)** · [MIT License](../LICENSE)

The stable no-build Cutout app, organized as four editable files:

- `index.html` — the Vue template and CDN links
- `style.css` — the original design styles
- `app.js` — Vue 3 application state and image export
- `model.worker.js` — Transformers.js model loading and inference

No npm install, bundler, compilation, or build command is needed. Vue 3, Tailwind CSS 4, and Transformers.js load from versioned CDNs. The first visit needs an internet connection for those libraries and the ORMBG model. Photos are processed locally in the browser.

## Run

From VS Code, open `main/index.html` with Live Server. Alternatively, from the project root:

```bash
cd main  # from the project root
python3 -m http.server 8766 --bind 127.0.0.1
```

Open `http://127.0.0.1:8766`. Browser modules and workers require local HTTP, so opening `index.html` with `file://` will not work.

The model is cached in the browser's Cache Storage for this origin. The **Model Storage** panel shows the cache location, file count, and size, and provides a button to clear it. The port is part of the origin, so running on a different port uses a separate model cache.

Model: [onnx-community/ormbg-ONNX](https://huggingface.co/onnx-community/ormbg-ONNX), Apache 2.0. The app uses Transformers.js **4.3.0**. It first tries **WebGPU with FP16** weights (about 88.1 MB). If WebGPU is absent or fails during loading or processing, it retries with **WASM and Q8** weights (about 44.3 MB). The status panel shows which engine loaded. A fallback downloads a separate model file on first use. Earlier Vite editions are indexed in [`../archive/README.md`](../archive/README.md).

For the model architecture and the browser processing flow, see the [main project README](../README.md#ormbg-model-architecture).
