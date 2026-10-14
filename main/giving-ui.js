import { ref, computed, nextTick, watch, onMounted, onUnmounted } from './vendor/vue-3.5.43.esm-browser.prod.js'
import { localStore, requestPersistence, downloadBlob } from './local-store.js'
import { BITCOIN_ADDRESS, btc, paymentUri, createGiftIntent, addressTransactions, matchingTransactions, manualTransaction, receiptFor, encodeCode, decodeCode, isSupporter, verifyCode, encodeRequest, decodeRequest } from './giving.js'

export const GivingPanel = {
  props: { diagnostics: Function, modelValue: Boolean }, emits: ['supporter', 'update:modelValue'],
  setup(props, { emit }) {
    const dialog = ref(null), qr = ref(null), opened = ref(false), amount = ref(10), intent = ref(null), receipt = ref(null), supporter = ref(null)
    const working = ref(false), checking = ref(false), notice = ref(''), issue = ref(''), restore = ref(''), txid = ref('')
    const message = ref(''), attachDiagnostics = ref(false), drafts = ref([]), persistence = ref(false)
    const code = computed(() => intent.value ? encodeRequest(intent.value) : receipt.value && isSupporter(receipt.value) ? encodeCode(receipt.value) : supporter.value ? encodeCode(supporter.value) : '')
    const uri = computed(() => intent.value ? paymentUri(intent.value) : `bitcoin:${BITCOIN_ADDRESS}`)
    let timer, previousFocus, alive = true
    async function saveSupporter(value) {
      if (!isSupporter(value)) return
      await localStore.put('settings', { id: 'supporter', receipt: value, code: encodeCode(value) })
      supporter.value = value; emit('supporter', true)
      persistence.value = await requestPersistence()
    }
    async function renderQr() {
      await nextTick()
      if (!qr.value || !globalThis.QRCodeStyling) return
      qr.value.replaceChildren()
      new globalThis.QRCodeStyling({ width: 256, height: 256, type: 'svg', data: uri.value, margin: 16,
        qrOptions: { errorCorrectionLevel: 'Q' }, dotsOptions: { color: '#1c3631', type: 'rounded' },
        cornersSquareOptions: { color: '#ae5f45', type: 'extra-rounded' }, cornersDotOptions: { color: '#1c3631', type: 'dot' },
        backgroundOptions: { color: '#ffffff' },
      }).append(qr.value)
    }
    async function open() {
      if (opened.value) return
      previousFocus = document.activeElement; opened.value = true
      await nextTick()
      if (!opened.value || !props.modelValue) return
      dialog.value.showModal(); dialog.value.scrollTop = 0; renderQr()
      if (intent.value) checkPayment()
    }
    function close() {
      if (!opened.value) return
      dialog.value?.close(); opened.value = false; emit('update:modelValue', false); previousFocus?.focus()
    }
    watch(() => props.modelValue, value => value ? open() : close(), { flush: 'post' })
    async function createRequest() {
      if (working.value || checking.value) return
      working.value = true; issue.value = ''; notice.value = ''
      try {
        const next = await createGiftIntent(Number(amount.value))
        // Persist before presenting any payment destination/amount.
        await localStore.put('settings', { id: 'gift-intent', intent: next })
        intent.value = next; receipt.value = null; txid.value = ''
        notice.value = 'Your gift request is ready. Send the exact BTC amount so we can recognize it.'
        await renderQr()
      } catch (error) { issue.value = error.message }
      finally { working.value = false }
    }
    async function acceptPayment(tx) {
      const value = receiptFor(intent.value, tx)
      await saveSupporter(value)
      await localStore.put('settings', { id: 'last-gift', receipt: value })
      await localStore.remove('settings', 'gift-intent')
      receipt.value = value; intent.value = null
      notice.value = isSupporter(value) ? 'Gift seen. Thank you! Your supporter studio is ready.' : 'Gift seen. Thank you for giving to Cutout!'
    }
    async function checkPayment(manual = false) {
      if (!intent.value || checking.value || working.value || document.visibilityState === 'hidden') return
      checking.value = true; issue.value = ''
      try {
        const transactions = await addressTransactions()
        const matches = matchingTransactions(intent.value, transactions)
        const chosenId = txid.value.trim().toLowerCase()
        let match
        if (chosenId) {
          if (!/^[a-f0-9]{64}$/.test(chosenId)) throw new Error('Enter the 64-character transaction ID from your wallet.')
          // Direct lookup also recovers a payment no longer in the latest address page.
          const { apiJson } = await import('./giving.js')
          const tx = await apiJson(`/tx/${chosenId}`)
          if (tx.txid !== chosenId) throw new Error('Mempool returned a different transaction. Please try again.')
          match = manualTransaction(intent.value, tx)
          if (!match) throw new Error('That transaction is not a new payment to Cutout for this gift request.')
        } else if (matches.length === 1) match = matches[0]
        else if (matches.length > 1) throw new Error('More than one payment matches. Enter your wallet’s transaction ID below.')
        if (match) await acceptPayment(match)
        else notice.value = Date.now() > intent.value.expiresAt
          ? 'The price quote has expired. If you already sent this amount, keep this request—we’re still watching. Otherwise create a fresh request.'
          : 'Waiting for your gift to appear. We check about every 20 seconds while Cutout is open.'
      } catch (error) { issue.value = error.message }
      finally { checking.value = false }
    }
    async function restoreCode() {
      if (working.value || checking.value) return
      working.value = true; issue.value = ''
      try {
        if (restore.value.trim().startsWith('CUTOUTGIFT1.')) {
          const next = decodeRequest(restore.value)
          await localStore.put('settings', { id: 'gift-intent', intent: next })
          intent.value = next; receipt.value = null; notice.value = 'Gift request restored. We’ll check for its payment.'
          await renderQr()
        } else {
          const value = await verifyCode(restore.value)
          await saveSupporter(value); receipt.value = value
          notice.value = 'Welcome back. Your supporter studio is ready on this device.'
        }
        restore.value = ''
      } catch (error) { issue.value = error.message }
      finally { working.value = false }
      if (intent.value) checkPayment()
    }
    async function copy(text, label) {
      try { await navigator.clipboard.writeText(text); notice.value = `${label} copied.` }
      catch { issue.value = 'Copy is unavailable here. Select the text below and copy it manually.' }
    }
    function saveCode() {
      downloadBlob(new Blob([`Cutout — ${code.value.startsWith('CUTOUTGIFT1.') ? 'gift recovery' : 'supporter'} code\n\n${code.value}\n\nKeep this file. Paste the code into “Restore a code” in another Cutout installation.\nPresets and batch photos stay on their original device.\n`], { type: 'text/plain' }), 'cutout-code.txt')
    }
    async function saveMessage() {
      issue.value = ''
      if (!supporter.value || !message.value.trim()) return
      working.value = true
      try {
        const draft = { id: crypto.randomUUID(), createdAt: Date.now(), text: message.value.trim().slice(0, 1000),
          diagnostics: attachDiagnostics.value ? props.diagnostics() : null, txid: supporter.value.txid, status: 'saved-locally' }
        await localStore.put('messages', draft); drafts.value.unshift(draft); message.value = ''; attachDiagnostics.value = false
        notice.value = 'Message saved on this device. It has not been sent; delivery is coming later.'
      } catch (error) { issue.value = error.message }
      finally { working.value = false }
    }
    function downloadDraft(draft) { downloadBlob(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }), 'cutout-message.json') }
    async function removeDraft(id) {
      try { await localStore.remove('messages', id); drafts.value = drafts.value.filter(draft => draft.id !== id) }
      catch (error) { issue.value = error.message }
    }
    async function importFile(event) {
      const file = event.target.files?.[0]; event.target.value = ''
      if (!file) return
      if (file.size > 60000) { issue.value = 'Choose a Cutout code text file smaller than 60 KB.'; return }
      const text = await file.text(); restore.value = text.match(/CUTOUT(?:GIFT)?1\.[A-Za-z0-9_-]+/)?.[0] || text.trim()
      await restoreCode()
    }
    onMounted(async () => {
      try {
        const [saved, pending, last, messages] = await Promise.all([localStore.get('settings', 'supporter'), localStore.get('settings', 'gift-intent'), localStore.get('settings', 'last-gift'), localStore.list('messages')])
        if (!alive) return
        if (saved?.code) { const value = decodeCode(saved.code); if (isSupporter(value)) { supporter.value = value; emit('supporter', true) } }
        if (pending?.intent) intent.value = decodeRequest(encodeRequest(pending.intent))
        receipt.value = last?.receipt || null; drafts.value = messages.sort((a, b) => b.createdAt - a.createdAt)
        timer = setInterval(() => { if (intent.value) checkPayment() }, 20000)
        if (intent.value) checkPayment()
      } catch (error) { issue.value = error.message }
    })
    onUnmounted(() => { alive = false; clearInterval(timer) })
    return { dialog, qr, opened, amount, intent, receipt, supporter, working, checking, notice, issue, restore, txid, message, attachDiagnostics, drafts, persistence,
      code, uri, address: BITCOIN_ADDRESS, btc, open, close, createRequest, checkPayment, restoreCode, saveCode, copy, saveMessage, downloadDraft, removeDraft, importFile, renderQr }
  },
  template: `
    <button class="give-nav" @click="$emit('update:modelValue', true)"><span aria-hidden="true">♡</span> {{ supporter ? 'Supporter studio' : 'Give & grow' }}</button>
    <Teleport to="body"><dialog ref="dialog" class="giving-dialog" aria-labelledby="giving-title" @cancel.prevent="close" @click="($event.target === dialog) && close()">
      <div class="giving-inner">
        <div class="dialog-close-wrap"><button class="dialog-close" aria-label="Close giving" autofocus @click="close">×</button></div>
        <div class="giving-hero"><span class="section-index">A LITTLE GIFT. MORE POSSIBILITY.</span><h2 id="giving-title">Good things<br>grow <em>together.</em></h2><p>Help keep Cutout open, independent, and made with care. Give any amount in bitcoin.</p><div class="giving-benefits"><span>🎨 Saved brand backdrops</span><span>📚 Batch photo processing</span><span>💬 A little note to us</span></div><small>A gift of $10 USD or more opens your supporter studio. No subscription.</small></div>
        <div class="giving-body">
          <div v-if="supporter" class="supporter-welcome"><span>✳</span><div><strong>Your supporter studio is open.</strong><p>Thank you for helping this little tool grow.</p></div></div>
          <section v-if="!intent && !receipt" class="gift-start"><h3>Choose your little contribution</h3><div class="gift-amounts"><button v-for="value in [5,10,21,50]" :aria-pressed="Number(amount) === value" :class="{ chosen: Number(amount) === value }" @click="amount = value">\${{ value }}</button></div><label class="field-label">Or choose an amount · USD<input type="number" min="1" max="10000" step="1" v-model="amount"></label><button class="button button-accent full" :disabled="working" @click="createRequest">{{ working ? 'Preparing your gift…' : 'Continue with bitcoin' }} <span>↗</span></button><p class="giving-fine">No wallet connection. You choose whether to send a payment.</p></section>
          <section v-if="intent" class="payment-section"><div class="qr-layout"><div class="qr-card"><div ref="qr" class="gift-qr" role="img" aria-label="Bitcoin payment QR code"></div><span>SCAN A LITTLE GOOD INTO THE WORLD</span></div><div class="payment-copy"><span class="section-index">YOUR BITCOIN GIFT</span><h3>{{ btc(intent.sats) }} <small>BTC</small></h3><p>{{ intent.sats.toLocaleString() }} sats · approximately \u0024{{ (intent.sats * intent.rate / 1e8).toFixed(2) }} USD</p><a class="button button-dark full" :href="uri">Open bitcoin wallet ↗</a><button class="button button-outline full" @click="copy(btc(intent.sats), 'BTC amount')">Copy exact amount</button><p class="giving-fine">Send the exact amount shown. A few extra sats help us recognize your gift. Wallet fees are separate. Bitcoin on-chain only.</p></div></div><label class="field-label">Cutout’s bitcoin address<textarea class="address-text" :value="address" readonly rows="2" @focus="$event.target.select()"></textarea></label><button class="button button-outline full" @click="copy(address, 'Bitcoin address')">Copy bitcoin address</button><div class="payment-wait"><span class="privacy-dot"></span> {{ checking ? 'Checking for your gift…' : 'Watching for your gift' }}<button :disabled="checking || working" @click="checkPayment(true)">Check now</button></div><details class="gift-help"><summary>Already sent it, or need a fresh request?</summary><label class="field-label">Transaction ID from your wallet<input v-model="txid" spellcheck="false" autocapitalize="off" placeholder="Optional · 64 characters"></label><button class="button button-outline full" :disabled="checking || working" @click="checkPayment(true)">Check this transaction</button><p class="giving-fine">If your wallet sent a different amount, this checks its actual gift value against your saved USD quote.</p><label class="field-label">New gift amount · USD<input type="number" min="1" max="10000" v-model="amount"></label><p class="giving-fine">Keep this request if you’ve already paid. A new request uses a different amount. The USD quote is held for 30 minutes; we can still recognize the original amount later.</p><button class="text-action" :disabled="working || checking" @click="createRequest">I haven’t paid · create a fresh request</button></details></section>
          <section v-if="receipt && !intent" class="gift-thanks"><div class="thank-mark">♡</div><h3>A little gift. A big thank you.</h3><p>{{ supporter ? 'Your saved backdrops, batch workspace, and message notebook are ready.' : 'Every contribution helps keep this project growing.' }}</p><a :href="'https://mempool.space/tx/' + receipt.txid" target="_blank" rel="noopener noreferrer">View gift on mempool.space ↗</a><button class="button button-outline full" :disabled="working" @click="receipt = null">Give again</button></section>
          <section v-if="code" class="code-card"><div><span class="section-index">{{ code.startsWith('CUTOUTGIFT1.') ? 'YOUR GIFT RECOVERY CODE' : 'YOUR SUPPORTER CODE' }}</span><h3>Keep your little key.</h3><p>{{ code.startsWith('CUTOUTGIFT1.') ? 'Save this before you leave. It restores this gift request on another device; the studio opens when the gift is seen.' : 'Save your code to open the supporter studio in another Cutout installation.' }}</p></div><textarea :value="code" aria-label="Portable Cutout code" readonly rows="3" @focus="$event.target.select()"></textarea><div class="inline-actions"><button class="button button-dark" @click="saveCode">Save code ↓</button><button class="button button-outline" @click="copy(code, 'Code')">Copy code</button></div><small>Saved in this browser. Keep a backup: clearing site data can remove it. Backdrops and batch photos stay on this device.</small></section>
          <details class="gift-help"><summary>Restore a code</summary><label class="field-label">Paste a supporter or gift recovery code<textarea v-model="restore" rows="3" spellcheck="false" autocapitalize="off" placeholder="CUTOUT1.…"></textarea></label><button class="button button-outline full" :disabled="working || checking || !restore.trim()" @click="restoreCode">{{ working ? 'Checking code…' : 'Restore my studio' }}</button><label class="file-import">Or choose your saved code file<input type="file" accept=".txt,text/plain" @change="importFile"></label><p class="giving-fine">Restoring on another device needs a connection to check the gift.</p></details>
          <section v-if="supporter" class="message-notebook"><span class="section-index">A NOTE FROM YOU 💬</span><h3>What’s on your mind?</h3><p>A thought, a thank-you, or something we can improve.</p><label class="field-label">Your message<textarea v-model="message" maxlength="1000" rows="4" placeholder="A little note…"></textarea></label><label class="wasm-option"><input type="checkbox" v-model="attachDiagnostics"> Include this session’s diagnostics</label><details v-if="attachDiagnostics" class="gift-help"><summary>Review attached diagnostics</summary><pre>{{ diagnostics() }}</pre></details><button class="button button-accent full" :disabled="working || !message.trim()" @click="saveMessage">Save message on this device</button><p class="giving-fine">Local notebook for now. Nothing is sent yet; message delivery is coming later.</p><ul class="draft-list"><li v-for="draft in drafts" :key="draft.id"><p>{{ draft.text }}</p><small>{{ new Date(draft.createdAt).toLocaleDateString() }} · Saved locally{{ draft.diagnostics ? ' · Diagnostics included' : '' }}</small><div class="inline-actions"><button class="text-action" @click="downloadDraft(draft)">Download note ↓</button><button class="text-action" @click="removeDraft(draft.id)">Delete</button></div></li></ul></section>
          <p v-if="notice" class="gift-notice" role="status">{{ notice }}</p><p v-if="issue" class="error-text" role="alert">{{ issue }}</p><p class="giving-fine">We recognize your gift when it appears on mempool.space, before a block confirmation. Prices and payment checks contact mempool.space; your photos and messages stay here.</p>
        </div>
      </div>
    </dialog></Teleport>`,
}
