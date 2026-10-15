// PNGs are already compressed. Store them in a ZIP without recompressing or
// loading the whole shelf into JavaScript memory. ZIP64 is unnecessary for the
// shelf's 100-file / 200 MB limit.
const encoder = new TextEncoder()
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
  return value >>> 0
})

async function checksum(blob, signal) {
  let crc = 0xffffffff
  let sinceYield = 0
  const reader = blob.stream().getReader()
  try {
    while (true) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      for (const byte of value) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]
      sinceYield += value.length
      if (sinceYield >= 1024 * 1024) {
        sinceYield = 0
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  return (crc ^ 0xffffffff) >>> 0
}

function header(size) {
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  return { bytes, word: (offset, value) => view.setUint16(offset, value, true), dword: (offset, value) => view.setUint32(offset, value, true) }
}

function uniqueName(name, names) {
  const clean = String(name || 'image.png').replace(/[\\/\x00-\x1f\x7f]/g, '_').replace(/^\.+/, '_').slice(0, 160) || 'image.png'
  const dot = clean.lastIndexOf('.')
  const stem = dot > 0 ? clean.slice(0, dot) : clean
  const extension = dot > 0 ? clean.slice(dot) : ''
  let result = clean
  for (let number = 2; names.has(result.toLowerCase()); number++) result = `${stem} (${number})${extension}`
  names.add(result.toLowerCase())
  return encoder.encode(result)
}

export async function createStoredZip(entries, { signal, onProgress = () => {} } = {}) {
  const files = [], directory = [], names = new Set()
  let offset = 0, count = 0, totalBytes = 0
  for await (const entry of entries) {
    signal?.throwIfAborted()
    if (!(entry.blob instanceof Blob)) throw new Error('A saved image is no longer available.')
    totalBytes += entry.blob.size
    if (count >= 100 || totalBytes > 200 * 1024 * 1024) throw new Error('This ZIP exceeds the shelf limit.')
    const name = uniqueName(entry.name, names)
    const crc = await checksum(entry.blob, signal)
    const date = new Date(entry.createdAt || Date.now())
    const day = ((Math.max(1980, Math.min(2107, date.getFullYear())) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >>> 1)
    const local = header(30)
    local.dword(0, 0x04034b50); local.word(4, 20); local.word(6, 0x800)
    local.word(10, time); local.word(12, day); local.dword(14, crc)
    local.dword(18, entry.blob.size); local.dword(22, entry.blob.size); local.word(26, name.length)
    files.push(local.bytes, name, entry.blob)
    const central = header(46)
    central.dword(0, 0x02014b50); central.word(4, 20); central.word(6, 20); central.word(8, 0x800)
    central.word(12, time); central.word(14, day); central.dword(16, crc)
    central.dword(20, entry.blob.size); central.dword(24, entry.blob.size); central.word(28, name.length); central.dword(42, offset)
    directory.push(central.bytes, name)
    offset += 30 + name.length + entry.blob.size
    onProgress(++count)
  }
  signal?.throwIfAborted()
  if (!count) throw new Error('No saved images to download yet.')
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0)
  const end = header(22)
  end.dword(0, 0x06054b50); end.word(8, count); end.word(10, count)
  end.dword(12, directorySize); end.dword(16, offset)
  return new Blob([...files, ...directory, end.bytes], { type: 'application/zip' })
}
