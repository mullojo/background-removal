# Changelog

## 1.0.0 — 2026-10-13

- Begin semantic versioning, with the same version in the app, diagnostics, PWA shell, and GitHub release tag.
- Automatically check for PWA updates on launch, reconnect, return to the app, and periodically while visible.
- Apply ready updates when the app has no photo open; preserve active work until Start over or a later launch.
- Show the running version beside the Cutout name and in the footer.
- Add release checks and a GitHub Actions workflow that publishes matching tags and release notes on a versioned push to main.

Earlier development used date-based identifiers through `2026-10-13-ui-1`.
Those commits remain in Git history; this is the first formal semantic release.
