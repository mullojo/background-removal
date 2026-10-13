# Archived versions

These are earlier Vite editions of the photo background-removal app. Their editable source, package manifests, and `pnpm-lock.yaml` files are preserved so someone can inspect or rebuild them. The stable app is in [`../main/`](../main/); the current model comparison workbench is in [`../lab/`](../lab/).

| Folder | What it preserves | Runtime and model |
| --- | --- | --- |
| [`ormbg-vite-wasm/`](ormbg-vite-wasm/) | ORMBG Vite edition from before the stable no-build app gained WebGPU fallback | Transformers.js 3.8.1; ORMBG WASM Q8 |
| [`bria-rmbg-1.4-vite/`](bria-rmbg-1.4-vite/) | Earlier BRIA-based Vite edition | Transformers.js 3.8.1; BRIA WebGPU FP16 with WASM Q8 fallback |

Each folder has its own README. With Node.js and pnpm installed, run `pnpm install --frozen-lockfile` followed by `pnpm dev` from that folder. The lockfiles record the dependency versions used by these editions. The locally retained `dist/` directories are generated snapshots and are excluded by the project `.gitignore`; a Git clone can recreate them with `pnpm build`.

BRIA RMBG 1.4 has [license restrictions](https://huggingface.co/briaai/RMBG-1.4). This folder records a historical experiment and is not the recommended public or gift-supported app.
