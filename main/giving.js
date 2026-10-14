export const BITCOIN_ADDRESS = 'bc1q4009vd4j005r5hk5mlry29xu8j6yatv9k0mgp6fstl974zue04dq9e6zlx'
export const API = 'https://mempool.space/api'
const TXID = /^[a-f0-9]{64}$/
export const btc = sats => (sats / 100000000).toFixed(8)
export const paymentUri = intent => `bitcoin:${BITCOIN_ADDRESS}?amount=${btc(intent.sats)}&label=Cutout%20gift`
export async function apiJson(path, fetcher = fetch) {
  const response = await fetcher(`${API}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(response.status === 429 ? 'Mempool is busy. Please wait a moment before checking again.' : 'Could not reach mempool.space. Reconnect and try again.')
  return response.json()
}
export async function addressTransactions(fetcher = fetch) {
  const results = await Promise.all([
    apiJson(`/address/${BITCOIN_ADDRESS}/txs`, fetcher),
    apiJson(`/address/${BITCOIN_ADDRESS}/txs/mempool`, fetcher),
  ])
  if (results.some(list => !Array.isArray(list))) throw new Error('Mempool returned an unexpected response. Try again shortly.')
  return [...new Map(results.flat().map(tx => [tx.txid, tx])).values()]
}
export async function createGiftIntent(usd, fetcher = fetch, now = Date.now(), random = crypto.getRandomValues(new Uint32Array(1))[0]) {
  if (!Number.isFinite(usd) || usd < 1 || usd > 10000) throw new Error('Choose a gift between $1 and $10,000.')
  const [prices, baseline] = await Promise.all([apiJson('/v1/prices', fetcher), addressTransactions(fetcher)])
  if (!Number.isFinite(prices.USD) || prices.USD <= 0 || !Number.isFinite(prices.time) || Math.abs(now / 1000 - prices.time) > 3600) throw new Error('A fresh Bitcoin price is unavailable. Please try again shortly.')
  const sats = Math.ceil(usd * 100000000 / prices.USD) + 1 + (random % 99)
  return { id: crypto.randomUUID(), createdAt: now, expiresAt: now + 30 * 60000, usd, rate: prices.USD, sats,
    minimumSats: Math.ceil(10 * 100000000 / prices.USD), baseline: baseline.map(tx => tx.txid) }
}
export function receivedSats(tx) {
  return (tx.vout || []).filter(out => out.scriptpubkey_address === BITCOIN_ADDRESS && Number.isSafeInteger(out.value) && out.value > 0).reduce((sum, out) => sum + out.value, 0)
}
export function matchingTransactions(intent, transactions) {
  return transactions.filter(tx => TXID.test(tx.txid) && !intent.baseline.includes(tx.txid)
    && (!tx.status?.confirmed || tx.status.block_time * 1000 >= intent.createdAt - 60000)
    && receivedSats(tx) === intent.sats)
}
export function manualTransaction(intent, tx) {
  const sats = receivedSats(tx)
  return sats > 0 ? matchingTransactions({ ...intent, sats }, [tx])[0] : undefined
}
// Portable receipts are an honor-system convenience, not signed licenses.
// The transaction is checked again on import; the code does not prove payer identity.
export function encodeCode(receipt) {
  return `CUTOUT1.${btoa(JSON.stringify(receipt)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`
}
export function decodeCode(input) {
  const code = input.trim()
  if (!/^CUTOUT1\.[A-Za-z0-9_-]+$/.test(code) || code.length > 3000) throw new Error('Paste a complete Cutout supporter code.')
  let receipt
  try { receipt = JSON.parse(atob(code.slice(8).replaceAll('-', '+').replaceAll('_', '/'))) } catch { throw new Error('That code could not be read. Paste it again from your saved file.') }
  if (receipt.v !== 1 || !TXID.test(receipt.txid) || !Number.isSafeInteger(receipt.sats) || receipt.sats < 1
    || !Number.isFinite(receipt.rate) || receipt.rate <= 0 || receipt.rate > 100000000
    || !Number.isSafeInteger(receipt.createdAt) || receipt.createdAt < 1) throw new Error('That supporter code is incomplete or unsupported.')
  return receipt
}
export const isSupporter = receipt => Boolean(receipt && receipt.sats >= Math.ceil(10 * 100000000 / receipt.rate))
export async function verifyCode(code, fetcher = fetch) {
  const receipt = decodeCode(code)
  const tx = await apiJson(`/tx/${receipt.txid}`, fetcher)
  if (tx.txid !== receipt.txid || receivedSats(tx) !== receipt.sats || !isSupporter(receipt)) throw new Error('This code does not match a qualifying gift to Cutout.')
  return receipt
}
export function receiptFor(intent, tx) {
  return { v: 1, txid: tx.txid, sats: receivedSats(tx), rate: intent.rate, createdAt: intent.createdAt }
}
export function encodeRequest(intent) {
  return `CUTOUTGIFT1.${btoa(JSON.stringify(intent)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`
}
export function decodeRequest(input) {
  const text = input.trim()
  if (!/^CUTOUTGIFT1\.[A-Za-z0-9_-]+$/.test(text) || text.length > 50000) throw new Error('Paste the complete gift recovery code.')
  let intent
  try { intent = JSON.parse(atob(text.slice(12).replaceAll('-', '+').replaceAll('_', '/'))) } catch { throw new Error('That gift recovery code could not be read.') }
  if (typeof intent.id !== 'string' || intent.id.length > 64 || !Number.isSafeInteger(intent.sats) || intent.sats < 1
    || !Number.isFinite(intent.rate) || intent.rate <= 0 || !Number.isSafeInteger(intent.createdAt)
    || intent.createdAt < 1 || intent.expiresAt !== intent.createdAt + 1800000 || !Array.isArray(intent.baseline)
    || intent.baseline.some(id => !TXID.test(id))) throw new Error('That gift recovery code is incomplete.')
  return intent
}
