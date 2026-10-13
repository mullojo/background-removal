# Background removal workbench

**[Open the live lab](https://background-removal-lab.pages.dev/)** · [MIT License](../LICENSE) for the app source; model licenses apply separately.

This is the experimental no-build version. Serve this directory with a local web server, then open its URL. On macOS, from this folder:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. A server is needed for the browser's module worker and model cache. The app itself has no build step or local package installation. Vue 3, Transformers.js, and the Tailwind CSS browser build load from CDNs, and model files download from Hugging Face on first use.

Upload a photo to run the selected model. ORMBG and BRIA each offer **WASM Q8** and **WebGPU FP16**. MODNet uses **WASM FP32**. Use **Run selected model** or the **Run** buttons in the comparison grid to compare results. The comparison grid keeps a separate result and inference time for each option on the same image. Results stay in memory until you upload a different image or reload the page. Select a result, choose a color or gradient, and download a PNG.

The status panel shows model loading, download progress when provided, inference time, and errors. **Cancel** stops the worker and leaves completed results available. The model cache is shown in the UI with a clear button. Clearing it removes model downloads from this browser origin's Cache Storage; the browser may retain other HTTP caches separately. This lab and the stable photo app both use Transformers.js 4.3.0.

ORMBG and BRIA default to WASM with Q8 weights; MODNet uses WASM with FP32 weights. WebGPU choices need a browser with WebGPU. A WebGPU option remains selectable only when the browser exposes WebGPU; model loading or execution can still fail on a given device, and the app reports that error without silently falling back. The first run on a new backend may include runtime warm-up within its inference timing. MODNet is intended for portraits; its results on objects may be poor. Large models and high-resolution photos can take a while or exceed the memory available to a device.

The earlier Transformers.js 3.8.1 WebGPU runtime failed on ORMBG's `MaxPool` operation with `ceil_mode`. The Transformers.js v4 native WebGPU runtime resolves the reported issue. In a portrait comparison, MODNet WebGPU FP16 and FP32 produced similar mask artifacts while WASM FP32 produced a clean portrait. That observation does not isolate the exact cause, but suggests that FP16 precision alone does not explain the artifacts. The lab now exposes only the working MODNet WASM path. The [official Transformers.js MODNet WebGPU example](https://github.com/huggingface/transformers.js-examples/tree/main/remove-background-webgpu) shows that a different GPU implementation is possible.

For BRIA, the Transformers.js 4.3.0 `image-segmentation` pipeline rejects the model type `SegformerForSemanticSegmentation`. This lab therefore loads BRIA with `AutoModel` and `AutoProcessor`, runs the model on the processed pixels, and normalizes its mask before compositing. In a local browser smoke test on a small synthetic image, both BRIA paths produced a sensible cutout: WASM Q8 took 7.5 seconds and the first WebGPU FP16 inference took 48.4 seconds. That first GPU run includes warm-up, so the numbers are not a reliable speed ranking. Repeat on your own photos. BRIA's [model card](https://huggingface.co/briaai/RMBG-1.4) describes non-commercial terms, so its comparison here is experimental rather than a candidate for the project's gift-supported release.

BEN2 was removed from this lab after its Transformers.js 4.3.0 WebGPU path failed with a `LayerNorm` shader error. An earlier version produced good cutouts, but a retry on the older runtime took several minutes without finishing inference on a small test image. Keeping the lab focused on the three usable models makes comparison simpler.

See [DEPENDENCIES.md](DEPENDENCIES.md) for the milestone stack, model variants, browser requirements, and publication notes. See [MODEL_NOTES.md](MODEL_NOTES.md) for source, license, and test history. This folder is an experiment; the stable app is in [`../main/`](../main/).
