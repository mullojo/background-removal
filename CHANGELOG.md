# Changelog

## 1.5.2 — 2026-10-14

- Add a touch-friendly GitHub repository link to the app footer.
- Refresh the main README with Bob's new studio screenshot, a prominent voluntary
  gift-support invitation, Bitcoin address, and current human-value baseline.
- Separate the everyday Cutout app links from the experimental model lab links.

## 1.5.1 — 2026-10-14

- Guard IndexedDB property access so blocked browser storage cannot abort module
  initialization and hide the free studio. Local extras report storage errors.
- Add a framework-independent startup loader with a waiting state, retry, and
  selectable diagnostics for failed imports or rendering instead of a blank page.
- Cache the loader in the PWA shell. Preserve local photos, presets, gift records,
  model caches, and the existing image/worker memory lifecycle.
- Cover throwing storage access, failed imports/rendering, slow startup, and
  successful mounting. The reported physical iOS Safari failure remains subject
  to device retesting; its exact cause was not available during implementation.

## 1.5.0 — 2026-10-14

- Replace font heart glyphs with a consistent symmetric outline SVG in giving.
- Reduce batch previews to 240 px and compose backdrops behind the subject in
  one full-resolution canvas. Release that canvas before the shelf write.
- Drop completed source files and scope export/source Blob references per photo.
  Await composition and UI cleanup, then allow a short reclamation interval before
  the next worker. Pause after the current photo if the app is hidden.
- Reconstruct the transparent workspace canvas on demand if a batch shelf write
  fails, preserving downloads and later background changes.
- Add Memory & device under Help & diagnostics: workspace image-buffer estimates,
  peak estimates, and optional browser heap/coarse device readings. Clearly mark
  unknown system pressure and RAM budgets; include samples in diagnostics.
- Verify no tracked workspace buffers remain before a new batch worker, only one
  full-resolution canvas is used in batch encoding, and failed writes retain an
  editable export. Preserve worker disposal before export and PWA update guards.

## 1.4.0 — 2026-10-14

- Integrate Bitcoin copying into one segmented address/details control with one
  visible value and copy action. Style the QR with orange dots and round corners,
  and use the established Cryptocurrency Icons Bitcoin SVG (CC0).
- Lead returning supporters to Message, with a prominent Give again action in
  the message modal. Notes remain local while message delivery is being built.
- Retain transparent sources for new batch photos. Apply a backdrop to the whole
  shelf or tap a tile to change that photo, including saved image/gradient presets.
  Update thumbnails, names, individual downloads, and ZIP contents automatically.
- Finish sequentially without inference; release bitmap/canvas resources, support
  pausing, count sources toward local storage limits, preserve exports on failed
  writes, and defer PWA updates during finishing. Older flattened outputs need
  reprocessing before their background can change.
- Add coverage for single/all edits, each backdrop type, failed writes, cleanup,
  copy-format switching, and the finishing update guard.

## 1.3.0 — 2026-10-14

- Replace wallet launching with visible address copying and expandable address,
  amount, and note copying. Use gift wording and Bitcoin details throughout the UI.
- Add a centered Bitcoin QR mark with high error correction and an SVG close icon.
- Show batch outputs as compact thumbnail tiles with individual PNG downloads and
  one cancellable ZIP download. Retain small thumbnails in IndexedDB and release
  their URLs when removed; keep original exports and single-use worker cleanup.
- Show developer-tools and preview status beside the version, toggle tools with
  seven more taps, and clarify background-image selection and saving.
- Preserve PWA sessions while preparing a ZIP. Verify archives with an independent
  ZIP reader, including duplicate names, Unicode, checksums, and cancellation.

## 1.2.0 — 2026-10-14

- Simplify giving into amount, payment, and supporter-studio screens, with a $10
  minimum and compact, readable Tailwind layouts throughout the changed controls.
- Show supporter passes and restore controls only after a qualifying gift. Saved
  passes now include a restore link that verifies the gift on another device.
- Open the native modal immediately, remove backdrop blur, load QR styling only
  when needed, reuse its QR, and poll only while the giving screen is visible.
- Add a temporary hidden developer preview: tap the app version seven times, then
  enable Preview supporter features in Help & diagnostics. It lasts for this tab,
  issues no code, records no gift, and does not overwrite real supporter access.
- Preserve pending gift requests, batch worker disposal, local drafts, and safe
  PWA update behavior. Add minimum-gift, first-paint, and preview-state checks.

## 1.1.1 — 2026-10-14

- Open every giving prompt through shared Vue state instead of a component ref,
  fixing browsers where the workspace, backdrop, and footer buttons could throw
  an undefined-reference error. Keep header opening, dismissal, focus return, and
  the PWA update guard synchronized through the same state.
- Add regression checks for all giving entry points and repeated open/close cycles.

## 1.1.0 — 2026-10-14

- Add a responsive bitcoin giving dialog with bundled QR Code Styling, wallet links,
  address/amount copying, live USD quotes, and exact-amount mempool detection.
- Save pending gift recovery codes and portable supporter receipts in IndexedDB;
  gifts of $10 USD or more open the local supporter studio. Imported supporter
  receipts are checked against the transaction again. Codes use an honor system,
  not signed licenses or proof of payer identity.
- Add saved color, gradient, and image backdrops, plus sequential batches of up to
  20 photos with PNG outputs retained in IndexedDB until explicitly removed.
- Add a local message notebook with optional reviewed diagnostics and JSON export.
  Messages are not delivered yet; no email service or backend is configured.
- Preserve the single-use worker memory lifecycle and defer PWA updates while
  giving, processing batches, or saving presets. Include new modules in offline shell.
- Add giving/matching/code validation, batch storage-failure, backdrop crop, and
  batch worker lifecycle checks.

## 1.0.0 — 2026-10-13

- Begin semantic versioning, with the same version in the app, diagnostics, PWA shell, and GitHub release tag.
- Automatically check for PWA updates on launch, reconnect, return to the app, and periodically while visible.
- Apply ready updates when the app has no photo open; preserve active work until Start over or a later launch.
- Show the running version beside the Cutout name and in the footer.
- Add release checks and a GitHub Actions workflow that publishes matching tags and release notes on a versioned push to main.

Earlier development used date-based identifiers through `2026-10-13-ui-1`.
Those commits remain in Git history; this is the first formal semantic release.
