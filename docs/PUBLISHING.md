# Repository and hosting setup

This document records the setup for a standalone `background-removal` repository. Creating and publishing the repository and deploying the demos are manual steps for the project owner.

## GitHub Desktop

In GitHub Desktop, choose **File → Add Local Repository** and select the existing `background-removal` folder. If Desktop reports that it is not a Git repository, choose the option to create a repository there.

| Field | Value |
| --- | --- |
| Name | `background-removal` |
| Description | Local browser photo background removal with Vue 3 and Transformers.js. No-build ORMBG app plus a model comparison lab, with WebGPU and WASM support. |
| Local path | The parent folder containing `background-removal`, currently `Components` |
| Initialize with a README | Unchecked; the project already has one |
| Git ignore template | None; keep the existing `.gitignore` |
| License | None until the owner chooses the license for the project's own source |
| Default branch | `main` |

The resulting repository root should be the existing `background-removal` folder. The folders `main/`, `lab/`, and `archive/` should sit directly inside it. Desktop creates a folder using the repository name under the chosen local path, so check the resulting path before creating it.

Review the files shown in Desktop. The source, documentation, `.gitignore`, and archived source and lockfiles belong in the repository. Generated `dist/`, installed `node_modules/`, and `.DS_Store` are ignored. Downloaded model weights are stored by the browser and are not project files.

If project files remain uncommitted after creation, use this commit summary:

```text
Add background removal app, model lab, and archived editions
```

Choose **Publish repository** when ready. For a public repository, clear **Keep this code private**. Choose the intended account or organization. For later changes, review them, commit locally, and use **Push origin**.

Suggested GitHub topics: `background-removal`, `transformers-js`, `onnx`, `webgpu`, `wasm`, `vue`, `image-processing`, `privacy`.

The project does not yet have a source license. Select and add that license before describing the repository as open source. Third-party library and model licenses apply separately; see [model notes](../lab/MODEL_NOTES.md) and [dependencies](../lab/DEPENDENCIES.md). BRIA remains an evaluation option with separate restrictions.

Official references: [GitHub Desktop repository creation and publication](https://docs.github.com/en/desktop/overview/creating-your-first-repository-using-github-desktop), [adding a local repository](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop).

## Cloudflare Pages: planned demo hosting

Both active apps are static files. A straightforward deployment is two Pages projects connected to the same GitHub repository:

| Setting | Stable app | Comparison lab |
| --- | --- | --- |
| Suggested Pages project name | `background-removal` | `background-removal-lab` |
| Production branch | `main` | `main` |
| Framework preset | None | None |
| Root directory | Repository root | Repository root |
| Build command | `exit 0` | `exit 0` |
| Build output directory | `main` | `lab` |

Each project serves its selected app at its own site root. Project names and final URLs depend on availability and the Cloudflare account. Add the actual demo links to the top-level README after deploying and testing them. Each hosted origin has its own model cache.

Use the HTTPS demo URLs for mobile testing. The stable app prefers WebGPU FP16 and falls back to WASM Q8 if GPU loading or inference fails. The lab exposes backend choices explicitly and reports failures. Test download progress, inference, export, and cache clearing on the target mobile browsers before publishing performance claims.

Official reference: [Cloudflare Pages static HTML deployment](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/).

Bitcoin gift support and its QR interface are planned future work.
