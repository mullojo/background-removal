# Archived BRIA RMBG 1.4 Vite edition

Historical version using Vue 3 + Tailwind CSS 4 + Transformers.js 3.8.1. The current no-build app is in [`../../main/`](../../main/). BRIA RMBG 1.4 runs inside a browser worker. Photos are processed on your device; model files download from Hugging Face on first use.

## Run locally

With Node.js and pnpm installed:

```bash
cd archive/bria-rmbg-1.4-vite  # from the project root
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL shown by Vite (normally `http://127.0.0.1:5173`). The app has an `index.html`, but browser workers and model loading require a local HTTP server; double-clicking the file will not work. `pnpm build` creates a static `dist/` folder that can be served locally with `pnpm preview`.

If a local `dist/` build is available, it can be served without installing Node packages. Generated builds are excluded from Git; after cloning, run the install command above and `pnpm build` to create one first. From the project root:

```bash
cd archive/bria-rmbg-1.4-vite/dist  # from the project root
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765`.

Upload a JPG, PNG, or WebP photo. The first run downloads and initializes the model, with status and per-file download progress. WebGPU is tried first where available; the browser CPU (WASM) engine is the fallback. Processing has stage messages, not a fake percentage. Choose a transparent, solid, or gradient background and export a full-resolution PNG.

The model is saved under this site's origin in the browser's **Cache Storage → transformers-cache**. The Model Storage panel displays cached file count and size and can clear the cache. Clearing removes downloaded model files and resets the in-memory worker; your current image result remains available. Browser storage is per origin, so switching between `127.0.0.1` and `localhost` creates separate caches.

Model: [briaai/RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4). Review [BRIA's model license](https://huggingface.co/briaai/RMBG-1.4/blob/main/License.pdf) for your use case.
