# Giving & the supporter studio

Cutout is an open source, gift-supported photo studio. The regular single-photo
workflow stays free. A one-time bitcoin gift of **$10 USD or more** opens saved
backdrops, batch processing, and a local notebook. There is no subscription.

## A simpler flow · v1.4.0

1. Open **Support Cutout**. Choose **$10**, **$21**, **$50**, or **Other** ($10 minimum).
2. Continue, then scan the QR or copy the visible **Bitcoin address**. Enter the
   exact BTC amount in your wallet. **Address + details** switches the copy field to show
   a complete bitcoin URI with “Supporting Cutout” as its note. Wallet support
   for pasting URIs varies; plain-address copying remains available. Cutout recognizes the gift automatically.
3. The supporter studio opens with a thank-you and a place to save a note.
   **Your supporter pass** becomes available only after the gift is recognized.

The amount screen and gift screen contain no supporter code or restore form.
Pending requests stay in IndexedDB, so reopening Cutout on the same browser
resumes the request. An older saved request still works at its original amount.

### Keep your supporter pass

After a qualifying gift, expand **Your supporter pass** to save a text file,
copy a restore link, or copy the underlying `CUTOUT1.…` code. The upgrade is
already stored in IndexedDB; this backup is for another device or cleared storage.

Opening the restore link on another device verifies its referenced transaction
before enabling the extras or showing any pass controls. The code is carried in
an URL fragment, which is not sent to the static host. The saved file includes
both that link and the code. Existing code-only backups can be restored by
opening the app URL with `#supporter=CUTOUT1.…` appended. A supporter who already
has access can also import another saved pass from the pass details.

Presets, notes, and batch outputs stay on the original browser/origin. The pass
restores access, not those local files. Keep backups: persistent storage is
requested after a real upgrade, but browsers can deny it or clear site data.

## Temporary developer preview

Requested for testing the extras without sending bitcoin:

1. Tap/click the small **app version below “cutout.” seven times**. Taps must be
   within five seconds of the previous tap. **TOOLS ON** appears beside the
   version immediately. Seven more taps hide the tools; this does not change
   the preview checkbox. **PREVIEW ON** appears there while extras are enabled.
2. Open **Help & diagnostics**, which expands to reveal **Temporary developer
   preview**. Enable **Preview supporter features**.
3. Test backdrops, batches, and the notebook. Turn the checkbox off when finished.

The switch uses this tab's **sessionStorage**, survives reloads in the tab, and
is separate from real supporter data. It creates no gift, gift receipt, or
supporter code. Test notes are marked as previews. It cannot be toggled during
an active image operation or batch. Disabling it preserves genuine supporter
access and retains test files locally; custom swatches are hidden when neither
real access nor preview access is active.

This is a temporary, user-requested convenience, not access control. To remove it
later: remove `main/developer-preview.js`, its app/import/template wiring, and its
service-worker entry; remove the `preview` prop and test-note path from the giving
component. Keep genuine gift/restore behavior and the ordinary diagnostic tools.

## Gift behavior

Cutout’s mainnet, on-chain Bitcoin address:

```text
bc1q4009vd4j005r5hk5mlry29xu8j6yatv9k0mgp6fstl974zue04dq9e6zlx
```

The app reads a current BTC/USD quote and an address transaction baseline from
mempool.space. It saves the request before showing a QR. The QR and wallet link
use a BIP21 URI with that address and amount. QR Code Styling 1.9.2 is bundled
with license notices and loaded only when the gift screen needs it.

A random 1–99 sats are added to the rounded-up gift value to help distinguish
requests sharing one address. The shown USD estimate includes those extra sats;
wallet fees are separate. This supports on-chain Bitcoin, not Lightning. Cutout
never connects to a wallet or sends a gift itself.

Automatic checks run approximately every 20 seconds **while the giving gift
screen is open and the page is visible**. Closing it stops polling. Opening it
again or returning from a wallet resumes checks. A matching unconfirmed mempool
transaction is sufficient; a newly confirmed transaction also qualifies.
Existing transaction IDs in the request's baseline are excluded, and old
confirmed transactions are rejected by block time. The automatic matcher
requires outputs to Cutout to total the exact requested sats.

**Bitcoin details** holds less common actions. If multiple gifts match, enter
the wallet's transaction ID. A direct ID also recovers a gift no longer on the
latest address page or one whose wallet changed the amount. The recipient,
baseline, and time checks still apply; its actual value determines eligibility
against the saved USD quote. Smaller legacy gifts are thanked without granting
the $10 extras. Separate small gifts are not accumulated in this version.

Quotes are held for 30 minutes for new sending. An already sent gift can
still be recognized afterward at its original quoted value. If your gift is already sent,
keep the request; creating a new request changes the amount. Stale prices,
network/API errors, throttling, and unavailable storage produce an actionable
error rather than presenting an unprepared request as ready.

### Honor-system limits

Passes are portable, shareable, **unsigned receipts**, not secure licenses or
proof of payer identity. Their client-side quote information can be altered.
One shared public address also permits amount collisions and claims against
public transactions. Baselines, distinctive amounts, and API verification reduce
accidental matches; they cannot establish ownership. Reliable attribution or
license enforcement would require a separate invoice/receipt service.

Mempool recognition is provisional. A gift can later be replaced or dropped.
This build honors a granted local upgrade rather than revoking it. Restoring a
pass whose transaction is no longer available fails until a valid receipt is used.

## Backdrops, batches, and notes

- **Saved backdrops:** up to 20 named colors, two-color gradients, or images.
  Images accept files up to 10 MB, are saved as JPEGs at up to 1600 px, and fill
  the photo using a centered crop. Foreground exports retain original dimensions.
- **Batch processing:** up to 20 photos, at most 40 MB each and 200 MB total input.
  One inference runs at a time. Each model worker is released before full-size
  export, and each PNG commits to IndexedDB before its photo is cleared.
- **Output shelf:** up to 100 outputs or 200 MB. Download individually, then remove
  shelf copies explicitly. Downloads do not delete them automatically. Use
  **Download all · ZIP** or the individual download on each thumbnail tile. Storage failures pause with the current export still available.
- **Pause after this photo:** stores the current result, then stops. An inference
  error also pauses; use the normal WASM retry. Queued source files are in memory,
  so choose remaining files again after a reload or interrupted batch.
- **Notebook:** up to 1,000 characters per note, with optional reviewed diagnostics.
  Notes can be exported as JSON or deleted. They are **saved locally, not sent**.
  Future email delivery needs a service; no API secret is included in the app.

The `cutout-local` IndexedDB database uses `settings`, `presets`, `outputs`, and
`messages` stores. Clearing the model cache or updating the PWA shell preserves
these stores. Photo inference stays in the browser. Giving contacts mempool.space
for public address/transaction lookups and quotes; notes, diagnostics, presets,
and outputs are not uploaded.

## Performance and verification

The modal opens synchronously through its native dialog API. Expensive backdrop
blur was removed. QR loading, rendering, and gift checks run after the first
paint; an unchanged QR is reused on reopening. Model preloading still runs
independently, preserving the mobile processing fixes. Fresh price/gift
requests can take network time after **Continue**, but do not delay opening.

An isolated local preview measured approximately **2.4 ms to native opening** and
**29.1 ms to the measured paint point** in one run. This is not an iPhone benchmark.
The timing instrumentation exists only in the temporary preview, not the app.

Node checks cover matching, quote minimum/freshness, code verification, delayed
QR work, lazy QR loading, session-only preview, restore-link verification, storage
failures, batch worker cleanup, and safe PWA updates. Browser checks cover the
simplified screens, hidden preview, notes, presets, and real batch inference.
Retest gift, pass saving/restoration, downloads, and batches on a physical
phone/PWA after publishing. No real bitcoin was sent during implementation.

Sources: [QR Code Styling](https://github.com/kozakdenys/qr-code-styling),
[mempool REST API](https://mempool.space/docs/api/rest), and
[Esplora address/transaction API](https://github.com/Blockstream/esplora/blob/master/API.md).

New batch outputs include small, stored thumbnails; older outputs without a
thumbnail remain downloadable with a placeholder. The ZIP stores original PNGs
without recompressing them, reads files sequentially, supports cancellation, and
never deletes shelf images. PWA updates wait for ZIP preparation to finish.

The QR includes a small centered Bitcoin mark with high error correction. Its
amount, label, and message use the [Bitcoin URI format](https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki);
the logo uses [QR Code Styling image options](https://github.com/kozakdenys/qr-code-styling).

## Batch finishing · v1.4.0

New batches retain the transparent subject alongside each finished PNG. Choose
a backdrop under **One finish for all photos**, or tap a thumbnail / its **Finish**
button to open choices for that photo. Colors, gradients, transparency, and saved
image presets all work. Edits update the local PNG, thumbnail, filename, and future
individual/ZIP downloads. They do not rerun background removal.

Finishing is sequential and can pause after the current photo. Clear any separate
photo in the main workspace first so two full-resolution photos do not compete
for phone memory. The 200 MB shelf limit includes retained sources and thumbnails
for new files. If a write fails, that photo's previous source and export remain.
Older opaque PNGs have no retained subject and show **Reprocess to change the
finish**; existing transparent exports can be finished directly.

Returning supporters see **Message**. It opens the local notebook, with a clearly
visible **Give again** action. Notes still stay on the device; no delivery service
is connected. Bitcoin copying uses one **Address only / Address + details**
segmented control and one copy button. The QR uses deeper orange dots for contrast,
circular finder marks, and the established [Bitcoin SVG](../main/icons/README.md).

Verification for v1.4.0: 30 Node checks cover retained sources, single/all edits,
backdrop rendering, resource cleanup, storage failures, copy selection, and safe
updates. An isolated browser fixture verified whole-shelf and individual edits,
returning-supporter messaging, Give again, and copy switching. At a 390 px
viewport, the shelf and modal fit without horizontal overflow and individual
finish targets measured 62 × 56 px. No screenshots or real gifts were needed.
Physical-phone QR scanning and finishing should still be checked after publishing.
