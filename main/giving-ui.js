import {
  ref, computed, watch, onMounted, onUnmounted,
} from './vendor/vue-3.5.43.esm-browser.prod.js'
import { localStore, requestPersistence, downloadBlob } from './local-store.js'
import { loadQrLibrary, afterPaint } from './qr-loader.js'
import {
  BITCOIN_ADDRESS, apiJson, btc, giftUri, createGiftIntent,
  addressTransactions, matchingTransactions, manualTransaction, receiptFor,
  encodeCode, decodeCode, isSupporter, verifyCode, encodeRequest, decodeRequest,
} from './giving.js'

export const GivingPanel = {
  props: {
    diagnostics: Function,
    modelValue: Boolean,
    preview: Boolean,
  },
  emits: ['supporter', 'update:modelValue'],

  setup(props, { emit }) {
    const dialog = ref(null)
    const qr = ref(null)
    const opened = ref(false)
    const amount = ref(10)
    const customAmount = ref(false)
    const intent = ref(null)
    const receipt = ref(null)
    const supporter = ref(null)
    const givingAgain = ref(false)
    const restoring = ref(false)
    const working = ref(false)
    const checking = ref(false)
    const notice = ref('')
    const issue = ref('')
    const restore = ref('')
    const txid = ref('')
    const message = ref('')
    const attachDiagnostics = ref(false)
    const drafts = ref([])
    const copyMode = ref('address')

    const hasExtras = computed(() => Boolean(supporter.value || props.preview))
    const showStudio = computed(() => hasExtras.value && !givingAgain.value)
    const showGiftDetails = computed(() => Boolean(intent.value && !showStudio.value))
    const code = computed(() => supporter.value ? encodeCode(supporter.value) : '')
    const uri = computed(() => intent.value ? giftUri(intent.value) : '')
    const copyValue = computed(() => copyMode.value === 'address' ? BITCOIN_ADDRESS : uri.value)
    const restoreLink = computed(() => {
      if (!code.value) return ''
      const url = new URL(window.location.href)
      url.hash = new URLSearchParams({ supporter: code.value }).toString()
      return url.href
    })

    let timer
    let previousFocus
    let alive = true
    let opening = 0
    let qrTarget
    let qrData = ''

    async function saveSupporter(value) {
      if (!isSupporter(value)) return
      await localStore.put('settings', {
        id: 'supporter',
        receipt: value,
        code: encodeCode(value),
      })
      supporter.value = value
      emit('supporter', true)
      requestPersistence()
    }

    async function renderQr(ticket) {
      const target = qr.value
      const data = uri.value
      if (!target || !data) return
      if (qrTarget === target && qrData === data && target.firstChild) return

      try {
        const QRCodeStyling = await loadQrLibrary()
        if (!opened.value || ticket !== opening || qr.value !== target) return
        if (qrTarget === target && qrData === data && target.firstChild) return
        target.replaceChildren()
        new QRCodeStyling({
          width: 240,
          height: 240,
          type: 'svg',
          data,
          margin: 16,
          qrOptions: { errorCorrectionLevel: 'H' },
          image: './icons/bitcoin.svg',
          imageOptions: { hideBackgroundDots: true, imageSize: .22, margin: 4, saveAsBlob: true },
          dotsOptions: { color: '#ca6400', type: 'dots' },
          cornersSquareOptions: { color: '#ca6400', type: 'dot' },
          cornersDotOptions: { color: '#ca6400', type: 'dot' },
          backgroundOptions: { color: '#ffffff' },
        }).append(target)
        qrTarget = target
        qrData = data
      } catch (error) {
        if (opened.value && ticket === opening) issue.value = error.message
      }
    }

    function stopWatching() {
      clearInterval(timer)
      timer = null
    }

    function startWatching() {
      stopWatching()
      if (!opened.value || !showGiftDetails.value) return
      timer = setInterval(() => checkGift(), 20000)
    }

    function prepareGiftView() {
      const ticket = opening
      // Let the native dialog paint before loading QR code or doing API work.
      afterPaint(() => {
        if (!opened.value || ticket !== opening || !showGiftDetails.value) return
        renderQr(ticket)
        checkGift()
        startWatching()
      })
    }

    function open() {
      if (opened.value || !props.modelValue) return
      previousFocus = document.activeElement
      opened.value = true
      opening += 1
      dialog.value.showModal()
      dialog.value.scrollTop = 0
      if (showGiftDetails.value) prepareGiftView()
    }

    function close() {
      if (!opened.value) return
      opened.value = false
      opening += 1
      stopWatching()
      if (hasExtras.value) givingAgain.value = false
      dialog.value.close()
      emit('update:modelValue', false)
      previousFocus?.focus()
    }

    watch(() => props.modelValue, value => value ? open() : close(), { flush: 'post' })
    watch(showGiftDetails, visible => {
      if (visible && opened.value) prepareGiftView()
      else stopWatching()
    }, { flush: 'post' })

    function chooseAmount(value) {
      customAmount.value = value === 'other'
      if (!customAmount.value) amount.value = value
    }

    async function createRequest() {
      if (working.value || checking.value) return
      working.value = true
      issue.value = ''
      notice.value = ''
      try {
        const next = await createGiftIntent(Number(amount.value))
        await localStore.put('settings', { id: 'gift-intent', intent: next })
        intent.value = next
        receipt.value = null
        txid.value = ''
      } catch (error) {
        issue.value = error.message
      } finally {
        working.value = false
      }
    }

    async function acceptGift(tx) {
      const value = receiptFor(intent.value, tx)
      await saveSupporter(value)
      await localStore.put('settings', { id: 'last-gift', receipt: value })
      await localStore.remove('settings', 'gift-intent')
      receipt.value = value
      intent.value = null
      givingAgain.value = false
      stopWatching()
      notice.value = 'Gift received. Thank you for supporting Cutout.'
    }

    async function checkGift(manual = false) {
      if (!opened.value || !showGiftDetails.value || checking.value || working.value) return
      if (document.visibilityState === 'hidden') return
      checking.value = true
      if (manual) issue.value = ''

      try {
        const current = intent.value
        const chosenId = manual ? txid.value.trim().toLowerCase() : ''
        let match
        if (chosenId) {
          if (!/^[a-f0-9]{64}$/.test(chosenId)) {
            throw new Error('Enter the transaction ID from your wallet: 64 characters.')
          }
          const tx = await apiJson(`/tx/${chosenId}`)
          if (tx.txid !== chosenId) throw new Error('Please check the transaction ID and try again.')
          match = manualTransaction(current, tx)
          if (!match) throw new Error('This transaction does not match a new gift to Cutout.')
        } else {
          const matches = matchingTransactions(current, await addressTransactions())
          if (matches.length > 1) throw new Error('Please add your transaction ID under Bitcoin details so we can identify your gift.')
          match = matches[0]
        }

        if (intent.value !== current) return
        if (match) await acceptGift(match)
        else if (Date.now() > current.expiresAt) {
          notice.value = 'Already sent your gift? We’re still watching. Otherwise, update the amount under Bitcoin details.'
        } else if (manual) {
          notice.value = 'Not seen yet. We’ll keep checking while this window is open.'
        }
      } catch (error) {
        issue.value = error.message
      } finally {
        checking.value = false
      }
    }

    async function restoreCode(input = restore.value) {
      if (working.value || checking.value) return
      working.value = true
      issue.value = ''
      try {
        const value = await verifyCode(input.trim())
        await saveSupporter(value)
        receipt.value = value
        givingAgain.value = false
        restore.value = ''
        notice.value = 'Welcome back. Your supporter studio is ready.'
      } catch (error) {
        issue.value = error.message
      } finally {
        working.value = false
      }
    }

    async function restoreFromLink() {
      const incoming = new URLSearchParams(window.location.hash.slice(1)).get('supporter')
      if (!incoming) return
      restoring.value = true
      emit('update:modelValue', true)
      await restoreCode(incoming)
      restoring.value = false
      if (supporter.value) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }

    async function copy(text, label) {
      try {
        await navigator.clipboard.writeText(text)
        notice.value = `${label} copied.`
      } catch {
        issue.value = 'Copy isn’t available. Select the text and copy it manually.'
      }
    }

    function saveCode() {
      if (!code.value) return
      const text = [
        'Cutout supporter pass',
        '',
        'Open this link to restore your studio on another device:',
        restoreLink.value,
        '',
        'Your supporter code:',
        code.value,
        '',
        'Backdrops, photos, and messages stay on their original device.',
      ].join('\n')
      downloadBlob(new Blob([text], { type: 'text/plain' }), 'cutout-supporter-pass.txt')
    }

    async function saveMessage() {
      if (!hasExtras.value || !message.value.trim() || working.value) return
      working.value = true
      issue.value = ''
      try {
        const draft = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          text: message.value.trim().slice(0, 1000),
          diagnostics: attachDiagnostics.value ? props.diagnostics() : null,
          txid: supporter.value?.txid || null,
          preview: !supporter.value && Boolean(props.preview),
          status: 'saved-locally',
        }
        await localStore.put('messages', draft)
        drafts.value.unshift(draft)
        message.value = ''
        attachDiagnostics.value = false
        notice.value = 'Note saved on this device. Nothing has been sent yet.'
      } catch (error) {
        issue.value = error.message
      } finally {
        working.value = false
      }
    }

    function downloadDraft(draft) {
      downloadBlob(new Blob([JSON.stringify(draft, null, 2)], {
        type: 'application/json',
      }), 'cutout-message.json')
    }

    async function removeDraft(id) {
      try {
        await localStore.remove('messages', id)
        drafts.value = drafts.value.filter(draft => draft.id !== id)
      } catch (error) {
        issue.value = error.message
      }
    }

    async function importFile(event) {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      try {
        if (file.size > 60000) throw new Error('Choose your saved supporter pass, up to 60 KB.')
        const text = await file.text()
        await restoreCode(text.match(/CUTOUT1\.[A-Za-z0-9_-]+/)?.[0] || text.trim())
      } catch (error) {
        issue.value = error.message
      }
    }

    function visibilityChanged() {
      if (opened.value && document.visibilityState === 'visible') checkGift()
    }

    onMounted(async () => {
      document.addEventListener('visibilitychange', visibilityChanged)
      window.addEventListener('hashchange', restoreFromLink)
      try {
        const [saved, pending, last, messages] = await Promise.all([
          localStore.get('settings', 'supporter'),
          localStore.get('settings', 'gift-intent'),
          localStore.get('settings', 'last-gift'),
          localStore.list('messages'),
        ])
        if (!alive) return
        if (saved?.code) {
          const value = decodeCode(saved.code)
          if (isSupporter(value)) {
            supporter.value = value
            emit('supporter', true)
          }
        }
        // Keep old pending requests working, without displaying their recovery code.
        if (pending?.intent) intent.value = decodeRequest(encodeRequest(pending.intent))
        receipt.value = last?.receipt || null
        drafts.value = messages.sort((a, b) => b.createdAt - a.createdAt)
      } catch (error) {
        issue.value = error.message
      }
      if (alive) restoreFromLink()
    })

    onUnmounted(() => {
      alive = false
      opening += 1
      stopWatching()
      document.removeEventListener('visibilitychange', visibilityChanged)
      window.removeEventListener('hashchange', restoreFromLink)
    })

    return {
      dialog, qr, opened, amount, customAmount, intent, receipt, supporter,
      givingAgain, restoring, working, checking, notice, issue, restore, txid,
      message, attachDiagnostics, drafts, copyMode, copyValue, hasExtras, showStudio, showGiftDetails, code, uri, restoreLink,
      address: BITCOIN_ADDRESS, btc, open, close, chooseAmount, createRequest,
      checkGift, restoreCode, saveCode, copy, saveMessage, downloadDraft,
      removeDraft, importFile,
    }
  },

  template: `
    <button
      class="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#dfc7b8] bg-[#f4e8dc] px-4 text-xs font-semibold text-[#86472f]"
      @click="$emit('update:modelValue', true)"
    >
      <span class="text-lg" aria-hidden="true">{{ supporter ? '💬' : '♡' }}</span>
      {{ preview ? 'Preview studio' : supporter ? 'Message' : 'Support Cutout' }}
    </button>

    <Teleport to="body">
      <dialog
        ref="dialog"
        class="support-dialog rounded-3xl bg-white text-forest shadow-2xl"
        aria-labelledby="giving-title"
        @cancel.prevent="close"
        @click="($event.target === dialog) && close()"
      >
        <div class="sticky top-0 z-10 h-0">
          <button
            class="absolute top-3 right-3 grid size-11 place-items-center rounded-full border-0 bg-[#f4f5f1] p-0 leading-none text-[#5c6e61] hover:bg-[#e9ede5]"
            aria-label="Close giving"
            autofocus
            @click="close"
          ><svg class="block size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
        </div>

        <div class="px-6 pt-8 pb-6 sm:px-8 sm:pt-9 sm:pb-8">
          <header class="pr-10">
            <span v-if="!showGiftDetails && !restoring" class="mb-4 grid size-11 place-items-center rounded-2xl bg-[#f6e9df] text-2xl text-clay" aria-hidden="true">♡</span>
            <h2 id="giving-title" class="m-0 text-[28px] leading-tight font-semibold tracking-tight">
              {{ restoring ? 'Opening your studio' : showStudio ? 'Leave us a message' : showGiftDetails ? 'Give with bitcoin' : 'Keep Cutout growing' }}
            </h2>
            <p class="mt-3 mb-0 text-sm leading-relaxed text-muted">
              {{ restoring ? 'Checking your saved gift…' : showStudio ? 'Your ideas help shape Cutout. Thank you for being here.' : showGiftDetails ? 'Scan with your wallet, or copy the details below.' : 'A one-time gift of $10 or more helps keep this little tool open and independent.' }}
            </p>
          </header>

          <p v-if="preview" class="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Testing extras · No gift recorded.
          </p>

          <div v-if="restoring" class="grid place-items-center py-12" role="status" aria-label="Restoring supporter pass"><span class="size-6 animate-spin rounded-full border-2 border-line border-t-clay"></span></div>

          <section v-if="!showGiftDetails && !showStudio && !restoring" class="mt-6" aria-label="Choose a gift">
            <ul class="m-0 grid list-none gap-3 p-0 text-sm text-[#52694f]">
              <li class="flex items-center gap-3"><span aria-hidden="true">🎨</span> Save your own backdrops</li>
              <li class="flex items-center gap-3"><span aria-hidden="true">📚</span> Process a batch of photos</li>
              <li class="flex items-center gap-3"><span aria-hidden="true">💬</span> Leave a note with diagnostics</li>
            </ul>

            <div class="mt-6 grid grid-cols-4 gap-2" role="group" aria-label="Gift amount">
              <button
                v-for="value in [10, 21, 50, 'other']"
                :key="value"
                class="min-h-12 rounded-xl border text-sm font-semibold"
                :class="(!customAmount && Number(amount) === value) || (customAmount && value === 'other') ? 'border-forest bg-forest text-white' : 'border-line bg-white text-[#5b725f]'"
                :aria-pressed="(!customAmount && Number(amount) === value) || (customAmount && value === 'other')"
                :disabled="working"
                @click="chooseAmount(value)"
              >{{ value === 'other' ? 'Other' : '$' + value }}</button>
            </div>

            <label v-if="customAmount" class="mt-4 block text-xs font-medium text-[#60715f]">
              Gift amount · USD
              <input
                v-model="amount"
                type="number"
                min="10"
                max="10000"
                step="1"
                class="mt-2 block min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-forest"
              >
            </label>

            <button
              class="mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-clay px-4 text-sm font-semibold text-white disabled:opacity-50"
              :disabled="working"
              @click="createRequest"
            >{{ working ? 'Preparing…' : 'Continue with bitcoin' }}</button>
            <p class="mt-3 mb-0 text-center text-xs text-[#85917e]">No subscription. Your photos stay private.</p>
          </section>

          <section v-if="showGiftDetails" class="mt-5" aria-label="Bitcoin gift">
            <div class="mx-auto w-52 max-w-full sm:w-60 rounded-3xl border border-[#ffe0b8] bg-white shadow-[0_8px_30px_-18px_#f7931a]">
              <div
                ref="qr"
                class="aspect-square [&_svg]:block [&_svg]:h-auto [&_svg]:max-w-full"
                role="img"
                aria-label="Bitcoin gift QR code"
              ></div>
            </div>
            <div class="mt-4 text-center">
              <button
                class="min-h-11 rounded-lg px-2 text-xl font-semibold tracking-tight"
                aria-label="Copy exact bitcoin amount"
                @click="copy(btc(intent.sats), 'BTC amount')"
              >{{ btc(intent.sats) }} <span class="text-xs font-medium text-[#85917e]">BTC ⧉</span></button>
              <p class="mt-1 mb-0 text-xs text-muted">
                {{ intent.sats.toLocaleString() }} sats · About \${{ (intent.sats * intent.rate / 1e8).toFixed(2) }} USD
              </p>
            </div>
            <div class="mt-5">
              <div class="grid grid-cols-2 gap-1 rounded-full bg-[#f4f3ef] p-1" role="group" aria-label="Bitcoin copy format">
                <button class="min-h-11 rounded-full px-3 text-xs font-semibold transition-colors" :class="copyMode === 'address' ? 'bg-white text-forest shadow-sm' : 'text-muted'" :aria-pressed="copyMode === 'address'" @click="copyMode = 'address'">Address only</button>
                <button class="min-h-11 rounded-full px-3 text-xs font-semibold transition-colors" :class="copyMode === 'details' ? 'bg-white text-forest shadow-sm' : 'text-muted'" :aria-pressed="copyMode === 'details'" @click="copyMode = 'details'">Address + details</button>
              </div>
              <label class="sr-only" for="gift-copy">Bitcoin details to copy</label>
              <textarea id="gift-copy" :value="copyValue" readonly :rows="copyMode === 'address' ? 2 : 4" spellcheck="false" class="mt-3 block w-full resize-none rounded-2xl border border-line bg-paper px-4 py-3 font-mono text-[11px] leading-relaxed break-all text-forest" @focus="$event.target.select()"></textarea>
              <p class="mt-2 mb-0 min-h-10 text-xs leading-relaxed text-muted">{{ copyMode === 'address' ? 'Just the address. Enter the exact BTC amount above in your wallet.' : 'Includes the amount and “Supporting Cutout” note. If your wallet does not accept bitcoin links, choose Address only.' }}</p>
              <button class="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#a94e00] px-4 text-sm font-semibold text-white hover:bg-[#923f00]" @click="copy(copyValue, copyMode === 'address' ? 'Bitcoin address' : 'Bitcoin details')"><span aria-hidden="true">⧉</span>{{ copyMode === 'address' ? 'Copy address' : 'Copy gift details' }}</button>
            </div>
            <p class="mt-3 mb-0 text-center text-xs leading-relaxed text-[#85917e]">
              Send the exact amount shown. Network fees are separate.<br>Bitcoin on-chain only.
            </p>
            <div class="mt-5 flex items-center gap-2 text-xs text-[#60745a]" role="status">
              <span class="size-1.5 rounded-full bg-[#73a480]"></span>
              {{ checking ? 'Checking your gift…' : 'Waiting for your gift' }}
              <button class="ml-auto min-h-11 px-2 font-semibold text-clay" :disabled="checking || working" @click="checkGift(true)">Check now</button>
            </div>

            <details class="mt-2 border-t border-[#edf0e7] pt-4 text-xs">
              <summary class="min-h-8 cursor-pointer font-medium text-muted">Bitcoin details</summary>
              <label class="mt-4 block text-muted">
                Transaction ID from your wallet
                <input v-model="txid" spellcheck="false" autocapitalize="off" class="mt-2 min-h-11 w-full rounded-lg border border-line px-3 text-xs" placeholder="Optional · 64 characters">
              </label>
              <button class="mt-2 min-h-11 font-semibold text-clay" :disabled="checking || working" @click="checkGift(true)">Check transaction</button>
              <p class="my-3 leading-relaxed text-[#85917e]">Your wallet changed the amount? Add its transaction ID above. We’ll check the actual gift.</p>
              <label class="block text-muted">New gift amount · USD
                <input v-model="amount" type="number" min="10" max="10000" class="mt-2 min-h-11 w-full rounded-lg border border-line px-3">
              </label>
              <button class="mt-2 min-h-11 font-semibold text-clay" :disabled="checking || working" @click="createRequest">Update gift amount</button>
              <p class="mb-0 leading-relaxed text-[#85917e]">Already sent your gift? Keep this request. The price is held for 30 minutes; a delayed gift can still be recognized.</p>
            </details>
          </section>

          <section v-if="showStudio" class="mt-6" aria-label="Supporter notebook">
            <p v-if="supporter" class="m-0 rounded-xl bg-sage px-4 py-3 text-sm text-sage-ink">Thank you. Your extras are ready in the workspace.</p>
            <label class="mt-5 block text-sm font-medium">Leave a note
              <textarea v-model="message" maxlength="1000" rows="3" placeholder="A thought, a thank-you, or an idea…" class="mt-2 block w-full rounded-xl border border-line bg-white p-3 text-sm font-normal leading-relaxed"></textarea>
            </label>
            <label class="mt-3 flex min-h-11 items-center gap-2 text-xs text-muted">
              <input v-model="attachDiagnostics" type="checkbox" class="size-4 accent-forest"> Include diagnostics
            </label>
            <details v-if="attachDiagnostics" class="mt-2 text-xs text-muted">
              <summary class="min-h-8 cursor-pointer">Review diagnostics</summary>
              <pre class="max-h-40 overflow-auto rounded-lg bg-paper p-3 text-[10px] whitespace-pre-wrap">{{ diagnostics() }}</pre>
            </details>
            <button class="mt-3 min-h-12 w-full rounded-xl bg-forest px-4 text-sm font-semibold text-white disabled:opacity-50" :disabled="working || !message.trim()" @click="saveMessage">Save note</button>
            <p class="mt-3 mb-0 text-xs leading-relaxed text-[#85917e]">Saved on this device. Message delivery is coming later.</p>
            <details v-if="drafts.length" class="mt-5 border-t border-[#edf0e7] pt-4 text-xs">
              <summary class="min-h-8 cursor-pointer font-medium text-muted">Saved notes · {{ drafts.length }}</summary>
              <ul class="m-0 list-none p-0">
                <li v-for="draft in drafts" :key="draft.id" class="mt-3 rounded-xl bg-paper p-3">
                  <p class="m-0 text-xs leading-relaxed break-words whitespace-pre-wrap">{{ draft.text }}</p>
                  <p class="mt-2 mb-0 text-[10px] text-[#85917e]">{{ new Date(draft.createdAt).toLocaleDateString() }} · Local{{ draft.preview ? ' · Test note' : '' }}</p>
                  <div class="flex gap-4">
                    <button class="min-h-11 font-semibold text-clay" @click="downloadDraft(draft)">Download</button>
                    <button class="min-h-11 text-muted" @click="removeDraft(draft.id)">Delete</button>
                  </div>
                </li>
              </ul>
            </details>
          </section>

          <details v-if="supporter && showStudio" class="mt-6 border-t border-[#edf0e7] pt-4 text-xs" aria-label="Supporter pass">
            <summary class="min-h-8 cursor-pointer font-medium text-muted">Your supporter pass</summary>
            <p class="my-3 leading-relaxed text-[#85917e]">Keep a backup to open your studio on another device. Your upgrade is already saved here.</p>
            <div class="grid grid-cols-2 gap-2">
              <button class="min-h-11 rounded-xl bg-sage px-3 font-semibold" @click="saveCode">Save pass ↓</button>
              <button class="min-h-11 rounded-xl border border-line px-3 font-semibold" @click="copy(restoreLink, 'Restore link')">Copy restore link</button>
            </div>
            <label class="mt-4 block text-muted">Supporter code
              <textarea :value="code" aria-label="Portable Cutout code" readonly rows="3" class="mt-2 w-full rounded-lg border border-line p-3 font-mono text-[10px] break-all" @focus="$event.target.select()"></textarea>
            </label>
            <button class="min-h-11 font-semibold text-clay" @click="copy(code, 'Code')">Copy code</button>
            <details class="mt-3">
              <summary class="min-h-8 cursor-pointer text-muted">Restore another pass</summary>
              <textarea v-model="restore" aria-label="Supporter code to restore" rows="3" spellcheck="false" class="mt-2 w-full rounded-lg border border-line p-3 font-mono text-[10px]"></textarea>
              <button class="min-h-11 font-semibold text-clay" :disabled="working || checking || !restore.trim()" @click="restoreCode()">Restore pass</button>
              <label class="mt-2 block text-muted">Or choose a saved pass<input type="file" accept=".txt,text/plain" class="mt-2 block w-full min-h-11 text-xs" @change="importFile"></label>
            </details>
          </details>

          <button v-if="showStudio" class="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#f3cfa5] bg-[#fff6e9] px-4 text-sm font-semibold text-[#a94e00] hover:bg-[#ffedcf]" @click="givingAgain = true"><span aria-hidden="true">♡</span> Give again</button>
          <button v-if="givingAgain && hasExtras" class="mt-2 min-h-11 w-full text-xs text-muted" @click="givingAgain = false">Back to my message</button>
          <p v-if="notice" class="mt-4 mb-0 rounded-xl bg-sage px-3 py-2 text-xs leading-relaxed text-sage-ink" role="status">{{ notice }}</p>
          <p v-if="issue" class="mt-4 mb-0 rounded-xl bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800" role="alert">{{ issue }}</p>
          <p v-if="showGiftDetails && !hasExtras" class="mt-3 mb-0 text-center text-[10px] leading-relaxed text-[#85917e]">Your extras open automatically when we see your gift.</p>
        </div>
      </dialog>
    </Teleport>
  `,
}
