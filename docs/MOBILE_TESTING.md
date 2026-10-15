# Mobile testing and diagnostics

These notes apply to the stable [`main/`](../main/) app at [background-removal.pages.dev](https://background-removal.pages.dev/). The comparison lab has its own existing controls.

## Save a finished image

Choose the desired backdrop and wait for the export to finish. **Download image** uses the browser's download flow. If the browser supports PNG file sharing, **Share / Save…** opens the native share sheet. On iPhone, **Save Image** can save the PNG to Photos when that action is offered. The app shares the actual PNG file; the available destinations and their labels are controlled by the device.

## Capture a failure

Open **Help & diagnostics** and choose **Copy diagnostics**. If clipboard access is unavailable, the report appears in a text area for manual selection and copying. Include the report with a description of what happened, the iPhone model, and iOS version. Photos and filenames are excluded; image dimensions, MIME type, and byte size are included.

The report contains the app version, runtime, selected backend, processing stages, error messages/stacks when delivered, and a previous interrupted session if one was recorded. The latest 60 events and an earlier interrupted-session snapshot are saved in local storage for this site's origin. They remain on the device until that site's storage is cleared. No report is uploaded automatically.

If Safari shows “a problem repeatedly occurred,” reopen the page and copy diagnostics before starting a new run. An unfinished session can result from a crash, closing a tab, or reloading during processing; it does not identify a cause by itself. Native process termination can prevent JavaScript from logging an error. A `WebKitBlobResource` error alone also does not establish the cause.

## Recover and compare backends

- If processing is stuck, choose **Stop processing**. After 45 seconds of inference, the app also displays a reminder that the run can be stopped.
- After a handled error, choose **Retry with WASM** to try the same photo on the CPU backend.
- After a full-page crash, reopen the app, enable **Use WASM for the next run** in diagnostics, and choose the photo again. This preference resets when the page reloads.
- Compare the same photo with WebGPU and WASM. Record whether failure happened during decoding, model loading, inference, compositing, or PNG export. Try a smaller copy if the original fails.

The main app transfers a 1024 × 1024 pixel buffer to the model worker, rather than asking it to fetch a full-resolution blob URL. Both display previews are limited to a 1280-pixel longest edge. After preparing the model input and original preview, it closes the full-resolution ImageBitmap before model loading and inference. Once the mask arrives, it decodes the retained original file again for export and applies the soft mask using `destination-in` compositing. Temporary canvases are released and the transparent PNG is reused during export. Cache-size reporting reads metadata only; it does not load whole model bodies to calculate their size. The downloaded/shared output still uses the original photo dimensions, so decoding and exporting a large photo remain device-dependent limits.

## Observed interruption and memory changes

Two reports from Safari on an iPhone on 2026-10-13 showed:

| Photo dimensions | Pixels | Backend | Observed outcome |
| --- | ---: | --- | --- |
| 4284 × 5712 | 24.5 million | WebGPU FP16 | Session interrupted after inference started; no inference-end or JavaScript error was captured |
| 3024 × 4032 | 12.2 million | WebGPU FP16 | Inference completed in approximately 2 seconds and PNG export completed |

The successful report also included the first interrupted session as history; it did not show a second failure. Both model inputs were 1024 × 1024. The older app kept the full-resolution ImageBitmap during inference and used the full file for the original preview. One decoded RGBA copy of the larger photo alone is about 98 MB. That made overlapping photo and model memory a concrete concern, although the reports do not establish the native crash cause or isolate it from first-run GPU initialization.

Version `2026-10-13-mobile-2` releases the full-resolution decoded photo before inference and renders only the small previews in the page. Its diagnostics add `original-released-before-inference`, preview dimensions, an estimated decoded RGBA size, and `export-image-decoding`/`export-image-decoded` stages. These help distinguish a model-time interruption from a later full-resolution export failure. Retest the same original images on the phone; success on a desktop is not confirmation of an iPhone fix.

## Mobile-3 follow-up

Version `2026-10-13-mobile-3` automatically starts model loading on page open and
waits for readiness before decoding a waiting upload. Changing images detaches
the old previews and releases their URLs, bitmap, canvas, and export references
before the next decode. The model itself stays loaded for reuse. A queued upload
retains its WASM preference; cancellation clears it. A loading failure permits
WASM retry of the selected source even before a preview exists.

The latest `mobile-2` report showed the same 698 × 1467 PNG interrupting during
inference, then succeeding after manual preloading with 1699 ms inference. This
motivates sequencing model loading before decoding, but does not prove it fixes
the underlying interruption. The new `worker:mask-summary` event records minimum,
maximum, and mean alpha (0–255) and the percentage of mask pixels with alpha at
least 128. It helps identify an empty or nearly full mask without saving the mask;
it cannot establish whether the correct subject was selected.

Retest on iPhone: upload immediately while the model is loading, upload again after
it is ready, change images repeatedly, and compare WASM. Copy diagnostics after
an incomplete result or immediately after reopening following a crash. Expect
`model-ready` before `image-decoding`, `previous-image-released` before each decode,
and `worker:mask-summary` after successful inference.

Local native-Canvas checks with simulated workers cover startup queuing, decoding
order, resource release, cancellation, failed preload recovery, WASM selection,
soft transparency, sharing, and full-resolution export of a 24.5 MP source. They
do not validate actual model execution or physical iPhone stability.

## Mobile-4: reset between photos

The user's physical iPhone testing of the first PWA release reported successful
first images after reload, then a failed second image through **Change image** and
a tab crash on another retry. The same pattern occurred in a normal tab and the
installed PWA; desktop did not reproduce it. This narrows the investigation to
resources retained between runs, but does not identify the exact native cause.

`2026-10-13-mobile-4` uses one inference per worker. After extracting the mask, the
worker awaits the pipeline's `dispose()` and reports `worker:model-disposed`.
The page then terminates the worker and detaches its event handlers before
reopening the original photo for full-resolution export. On the next upload,
it releases old preview/export URLs, PNG references, canvases, and bitmaps,
lets Vue detach the previews, and yields before loading a fresh worker. It waits
for that model to be ready before decoding. Failed/cancelled runs also terminate
their worker. Downloaded weights and PWA shell caches are preserved.

This follows the [Transformers.js pipeline disposal API](https://huggingface.co/docs/transformers.js/api/pipelines).
It resets our image and inference resources without reloading the entire page;
browser-native memory reclamation timing remains controlled by the browser.
Every new photo incurs model initialization, typically reading already-cached weights.

After deployment, verify `mobile-4` under diagnostics, then process at least three
photos through **Change image** without reloading, first in Safari and then in the
installed PWA. Include the formerly failing second photo. Expect one new
`worker-created` generation per photo, `worker:model-disposed` and
`worker-released` before `export-image-decoding`, and `previous-image-released`
before the next model load. Copy diagnostics immediately after a failed result
before attempting another image.

Automated lifecycle tests verify per-photo workers, disposal before result/error,
old URL/canvas release before replacement model loading, stale-message isolation,
and WebGPU-to-WASM fallback. Native-Canvas checks cover five successive photos,
full-size exports, transparency, cancellation, and retry. These tests cannot
reproduce or prove a fix for the iPhone's native process crash.
The local in-app browser also completed three real WebGPU runs using the project's
icon PNGs through Change image, including a backdrop change between runs, without
reloading. This checks runtime compatibility rather than cutout quality or iPhone stability.

The user's subsequent repeated physical iPhone tests reported success on successive
images with `mobile-4`, confirming the reset change resolved the reported behavior
in those tests.

## UI-1: touch-friendly image controls

`2026-10-13-ui-1` replaces hold-to-compare with a tap-to-toggle **Compare original**
button, groups it with **Change image**, and adds **Start over**. Buttons use
44-pixel minimum targets and suppress text selection/callouts. The filename is a
small caption without the square glyph. Start over releases the image and resets
the backdrop while preserving downloaded weights and the PWA shell. On a phone,
check tapping Compare twice, keyboard activation where available, Change image,
and Start over followed by another upload.

## Remote inspection from a Mac

On iPhone, enable **Settings → Apps → Safari → Advanced → Web Inspector**. On Mac, enable **Safari → Settings → Advanced → Show features for web developers**. Connect and trust the phone, open the app on the phone, then select **Develop → your iPhone → the app URL** in Mac Safari. Open Console before reproducing the issue.

For Chrome on iPhone, enable **Chrome → Settings → Content Settings → Web Inspector** and relaunch Chrome, then select its page in the Mac Safari Develop menu.

References: [Apple device inspection](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios), [Chrome on iOS debugging](https://developer.chrome.com/blog/debugging-chrome-on-ios), [Web Share API](https://www.w3.org/TR/web-share/).

## Verification limits

Desktop browser smoke checks for the initial mobile improvements used controlled masks and simulated worker failures to verify compositing, PNG export, sharing calls, diagnostics, and recovery. For `mobile-2`, additional local checks using a native Canvas implementation verify that the original bitmap is closed before inference, that a 4284 × 5712 source uses 960 × 1280 previews, and that the full-size exported PNG retains its dimensions. They also exercise soft-mask transparency, interrupted-session recovery, WASM retry, and clipboard fallback. These checks do not reproduce an iPhone process crash or prove that a native Photos save completes. Retest the failing glass-bottle photo on the physical device after deployment.

## Batch memory cleanup · v1.5.0

Each batch photo gets a single-use model worker. After inference its pipeline is
disposed and its worker is terminated before full-size export. Batch previews
are limited to 240 px. Backgrounds are drawn behind the subject in the existing
full-size canvas, then that canvas is zeroed before the shelf transaction. The
transparent PNG remains available for later finishing. If storage fails, the
current PNG is still downloadable and its transparent canvas can be recreated
on demand for normal workspace edits.

After each successful save, completed input entries and temporary Blob references
are dropped. Composition completes, the workspace clears, Vue detaches old image
URLs, and a 250 ms interval gives the browser time to reclaim native resources.
No web API can force browser/GPU garbage collection; this interval is not proof
that process RAM has returned to its previous level. Hiding the app pauses after
the current saved photo. Choose remaining photos again to resume.

Under **Help & diagnostics → Memory & device**, workspace canvas/bitmap estimates
update as resources are tracked/released; peak estimates remain for the session.
These exclude model memory, GPU allocations, thumbnails, codecs, and general
browser overhead. Zero means these tracked resources were released, not that
the app uses zero RAM or that the phone has low memory pressure.

Optional browser JS-heap readings are limited and unreliable for total usage;
iPhone Safari does not expose them. Coarse `deviceMemory` values, when available,
are approximate device RAM rather than free RAM. The app cannot inspect other
apps, total free RAM, thermal state, or the OS's changing process budget. Disk
storage quotas and JS-heap limits must not be presented as that budget. The
experimental whole-app memory API has limited support and isolation requirements;
we do not change hosting/security headers solely to enable it.

For deeper measurements, use Safari's remote Web Inspector Memory timeline from
a Mac. Inspect growing allocations over a batch and compare the before/after
trend rather than treating any fixed number as a safe iPhone memory limit.

Retest 5–20 large camera photos in Safari and the PWA, with solid, gradient, and
image backdrops. Check `batch-photo-released` diagnostics report `imageBytes: 0`
and `imageResources: 0` between photos, exports keep full dimensions and correct
transparency, shelf storage failures leave a downloadable/editable current image,
and hiding the app pauses without starting another worker. Desktop lifecycle
checks cannot reproduce or prove a fix for native iPhone process termination.

Sources: [browser heap API limits](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory),
[coarse device memory](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory),
[experimental app-memory measurement](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory),
and [WebKit memory debugging](https://webkit.org/blog/6425/memory-debugging-with-web-inspector/).

Verification: 33 Node checks pass. A browser fixture using native canvases and a
controlled mask completed a two-photo Sage batch, retained correctly sized shelf
thumbnails (192 px and 240 px), and showed 0.0 MB of tracked workspace buffers
after cleanup. The fixture does not load the inference model or simulate native
GPU/process memory pressure; retest actual large photos on the physical phone.

## Blank startup investigation · v1.5.1

A report of a beige-only page in iOS Safari, while Mac Safari and iOS Chrome
opened normally, prompted a startup audit. The live app reported v1.5.0. No
physical-device console output was available, so the precise cause is unconfirmed.

One reproducible failure path was reading `globalThis.indexedDB` as a default
argument during module initialization: a throwing getter aborted all imports
before Vue mounted. The root stayed hidden by `v-cloak`, leaving the background.
This access is now guarded; blocked storage produces a local-feature notice
while the main studio remains usable.

A classic startup loader now displays a waiting state if loading is slow and a
readable failure card with selectable startup details if imports or mounting
fail. Reports omit URL fragments, keeping supporter codes out of startup
diagnostics. Retry reloads normally; it does not delete storage or model caches.

For the actual Safari report, compare a fresh Private tab and record the iOS
version. If only the existing Safari session fails, investigate that session's
cache/site data and extensions. If the new failure card appears, copy its startup
details. An older cached shell may need an online reload before receiving the
new loader. Native process termination cannot be caught by page JavaScript.

Verification: 36 Node checks pass. In an isolated browser preview, a deliberately
throwing IndexedDB getter still allowed the complete studio to mount, while a
missing app module displayed the retry/diagnostic card. This confirms those
specific startup paths; it does not reproduce the user's physical Safari session.

## Safari template compilation and recovery · v1.5.3

Live inspection of https://background-removal.pages.dev/ first rendered cached
v1.1.0, then automatically reloaded into v1.5.1. The updated app rendered without
startup errors in that browser. This confirms stale shells exist in real sessions;
it does not establish the exact cause of the physical iOS Safari report.

A cached shell that cannot initialize its JavaScript may not reach the app's
update activation logic or the new startup loader. Use **recover.html**, a separate
online page with no Vue, Tailwind, app imports, or storage initialization. Its
button verifies a fresh recovery-page response, unregisters only the exact app
scope, removes only `cutout-shell:<scope>:` caches, and reopens the studio. It
does not touch IndexedDB, `transformers-cache`, or other scopes. Recovery files
are intentionally not precached, letting older shell workers pass them through.

The Tailwind browser script is also deferred: its network loading no longer
blocks the parser before the fallback HTML and startup script are reached.
This removes one possible reason a new startup card would never appear. It does
not prove Tailwind caused the reported issue or catch native process termination.

After deploying v1.5.3, test https://background-removal.pages.dev/recover.html in
the affected Safari session, choose Refresh app files, and check the displayed
version after returning. If recovery itself fails, copy Recovery details. If
the app remains beige without a startup card, record the iOS version and obtain
a Safari remote console/network trace to distinguish script blocking, cache
issues, and a native process crash. Do not clear all website data: that would
remove the user's local studio records.

The user's startup report subsequently narrowed the failure: `Unexpected token
'<'` in Vue's native `Function` call during `app.js` mounting. This points to
template-generated JavaScript, rather than an app-module download or the storage
guard. The template contained `{{ (output.bytes / 1048576).toFixed(1) }}`. iOS
telephone detection can inject an `<a href="tel:…">` into numeric DOM text; inside
a Vue expression that yields invalid JavaScript.

The page now declares `<meta name="format-detection" content="telephone=no">`,
and that expression uses `memoryMB(output.bytes)` so its long numeric literal
lives only in JavaScript. A test with the actual bundled Vue compiler reproduces
the reported syntax error by inserting a telephone link in the former expression.
The full corrected template compiles and contains no long numeric literals in
interpolations. This is a closely matching reproduction; the actual mutated
iPhone DOM has not been inspected, so device retesting is still needed.

Sources: [Apple telephone format detection](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html),
[WebKit format-detection mutation report](https://bugs.webkit.org/show_bug.cgi?id=232856),
and [Vue's in-DOM template considerations](https://vuejs.org/guide/essentials/template-syntax.html).
