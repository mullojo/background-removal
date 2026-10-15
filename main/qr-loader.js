// Load the classic UMD bundle only when a gift actually needs a QR.
let loading

export function loadQrLibrary() {
  if (globalThis.QRCodeStyling) return Promise.resolve(globalThis.QRCodeStyling)
  if (loading) return loading

  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = new URL('./vendor/qr-code-styling-1.9.2.js', import.meta.url).href
    script.onload = () => resolve(globalThis.QRCodeStyling)
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('The QR could not load. You can still copy the address and amount.'))
    }
    document.head.append(script)
  })

  return loading
}

export function afterPaint(callback) {
  requestAnimationFrame(() => requestAnimationFrame(callback))
}
