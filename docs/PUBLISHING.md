# Repository and hosting setup

The public repository is [mullojo/background-removal](https://github.com/mullojo/background-removal), with the project's source under the [MIT License](../LICENSE). It currently processes photos. The repository can also accommodate future video experiments.

## GitHub Desktop

Select `background-removal` in GitHub Desktop. The repository root contains `main/`, `lab/`, and `archive/`, with production work currently on the `main` branch.

For each update, review the changed files, enter a commit summary, choose **Commit to main**, and then **Push origin**. Once Pages Git integration is configured, pushes to `main` trigger deployments.

The source, documentation, `.gitignore`, and archived source and lockfiles belong in the repository. Generated `dist/`, installed `node_modules/`, and `.DS_Store` are ignored. Downloaded model weights are stored by the browser and are not project files.

Suggested GitHub topics: `background-removal`, `transformers-js`, `onnx`, `webgpu`, `wasm`, `vue`, `image-processing`, `privacy`.

Third-party library and model licenses apply separately from the project's MIT license; see [model notes](../lab/MODEL_NOTES.md) and [dependencies](../lab/DEPENDENCIES.md). BRIA remains an evaluation option with separate restrictions.

Official references: [GitHub Desktop repository creation and publication](https://docs.github.com/en/desktop/overview/creating-your-first-repository-using-github-desktop), [adding a local repository](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop).

## Cloudflare Pages: planned demo hosting

Both active apps are static files. A straightforward deployment is two Pages projects connected to the same GitHub repository:

1. In the Cloudflare dashboard, open **Workers & Pages → Create application → Pages → Connect to Git**.
2. Connect GitHub and authorize access to `mullojo/background-removal`, then select that repository.
3. Create the stable app project using the settings below, then choose **Save and Deploy**.
4. Create a second Pages project from the same repository using the lab column.

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
