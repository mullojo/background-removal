# Changelog

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
