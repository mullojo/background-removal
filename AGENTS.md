# Background Removal project

- `main/` is the stable no-build app. `lab/` is a separate comparison tool;
  `archive/` preserves earlier implementations.
- `VERSION` is the authoritative semantic version. For changes to runtime app
  files, run `node scripts/release.mjs patch` (fixes/small UI changes), `minor`
  (compatible new functionality), or `major` (incompatible contracts/behavior).
  Complete the new `CHANGELOG.md` section. Commit VERSION, generated
  `main/version.js`, and the service worker release together. Do not invent
  date-based app/cache versions or edit those generated values independently.
- Run `node scripts/release.mjs --check` and `node --test tests/*.test.cjs` before
  preparing a release commit. CI also checks that app changes bump the version.
- Preserve one inference per model worker: dispose the pipeline, terminate its
  worker before full-size export, and release the previous image before loading
  the next model. This behavior resolved repeated-run iPhone crashes.
- Automatic PWA updates must wait for processing/sharing to finish and for the
  photo to be cleared. Never reload away an unsaved or exported photo.
- The established workflow is to prepare local commits and let the user push
  in GitHub Desktop unless they explicitly ask to push. The versioned push to
  `main` triggers matching GitHub tags/releases through the workflow.
