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

The main app transfers a 1024 × 1024 pixel buffer to the model worker, rather than asking it to fetch a full-resolution blob URL. It applies the returned soft mask using `destination-in` compositing, closes the original ImageBitmap after use, releases temporary canvases, and reuses the transparent PNG during export. Cache-size reporting reads metadata only; it does not load whole model bodies to calculate their size. The output still uses the original photo dimensions, so large-image memory use remains a device-dependent limit.

## Remote inspection from a Mac

On iPhone, enable **Settings → Apps → Safari → Advanced → Web Inspector**. On Mac, enable **Safari → Settings → Advanced → Show features for web developers**. Connect and trust the phone, open the app on the phone, then select **Develop → your iPhone → the app URL** in Mac Safari. Open Console before reproducing the issue.

For Chrome on iPhone, enable **Chrome → Settings → Content Settings → Web Inspector** and relaunch Chrome, then select its page in the Mac Safari Develop menu.

References: [Apple device inspection](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios), [Chrome on iOS debugging](https://developer.chrome.com/blog/debugging-chrome-on-ios), [Web Share API](https://www.w3.org/TR/web-share/).

## Verification limits

Desktop browser smoke checks use controlled masks and simulated worker failures to verify compositing, PNG export, sharing calls, diagnostics, and recovery. They do not reproduce an iPhone process crash or prove that a native Photos save completes. Retest the failing glass-bottle photo on the physical device after deployment.
