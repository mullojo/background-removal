# Versions and releases

`VERSION` is the source of truth, beginning with **1.0.0**. The app's header,
footer, diagnostics, service worker cache, changelog, Git tag, and GitHub release
use that version. GitHub tags have a `v` prefix (`v1.0.0`); the file contains
only `1.0.0`. Earlier date-based versions remain in Git history.

## Make a change

After editing runtime files, run one of these from the repository root:

```sh
node scripts/release.mjs patch
node scripts/release.mjs minor
node scripts/release.mjs major
```

Use a patch for fixes and small UI changes, a minor for compatible new
functionality, and a major for incompatible contracts or behavior. The script
updates `VERSION`, generates `main/version.js`, updates the shell release, and
adds a changelog section. Replace its TODO with the release's actual changes.
An explicit increasing version such as `node scripts/release.mjs 1.2.0` also works.
Do not edit the app/cache version values separately.

```sh
node scripts/release.mjs --check
node --test tests/*.test.cjs
```

Commit the change, version metadata, and changelog together, then **Push origin**
in GitHub Desktop. No separate tag push is required. Documentation-only changes
do not need a version bump unless they change cached runtime files.

## What GitHub does

`.github/workflows/release.yml` checks version synchronization, release notes,
and tests on pushes and pull requests. It compares app changes against the
event's base commit and fails if the runtime changed without an increased version.

On a versioned push to `main`, the workflow publishes `vX.Y.Z` at the tested
commit and creates **Cutout vX.Y.Z** with that changelog section as its notes.
It uses GitHub's built-in token with `contents: write` only in the publishing
job. No personal token or local GitHub CLI is required. Published releases are
not overwritten; a conflicting existing tag is rejected.

The workflow can also be run manually from the Actions tab on `main` to retry
publishing. Actions must be enabled for the repository. If repository or
organization policy disallows the workflow's write permission, the publishing
job reports the GitHub error; version checks still remain available locally.
The first workflow run and live release creation are verified after pushing.

Cloudflare Pages continues deploying `main/` from pushes to `main` under its
existing Git integration. GitHub release creation is separate from Pages
deployment; a release is not proof that a Pages deployment has completed.

Official references: [GitHub releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository),
[GitHub's release API](https://docs.github.com/en/rest/releases/releases#create-a-release).

## Running app and automatic updates

The subtle version below the Cutout name identifies the code actually running,
even when the device is offline or still has an older shell. The footer and
Copy diagnostics show the same value.

![Running version in the phone header](images/cutout-version-mobile.jpg)

Updates check on launch, reconnection, return to the app, and every five minutes
while visible and online. Repeated checks are throttled. A ready update activates
and reloads automatically when no photo is open and no work is running. If a
photo is present, save it and use **Start over**, or reopen the app later. There
is no update button in the new UI.

When another open app window activates an update, a window with a photo waits
to reload until that photo is cleared. Downloaded weights remain cached.
Browser scheduling, suspended apps, and offline connectivity affect when a
check can run; an app cannot update while its browser has suspended it.

The first upgrade from `ui-1` may still need its old **Update app** button once,
or closing all old app windows and reopening online. That old code cannot apply
the new automatic policy until this release is loaded.
