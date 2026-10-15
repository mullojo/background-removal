// Refinish saved transparent cutouts without loading the inference model.
// Decode one photo at a time, close bitmaps before encoding, and release canvases.
function contextFor(canvas) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not allocate image memory. Try a smaller photo.')
  return context
}
function png(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not finish this photo.')), 'image/png'))
}
export async function renderBatchFinish(cutout, choice) {
  let subject, backdrop, canvas, preview
  try {
    subject = await createImageBitmap(cutout)
    canvas = document.createElement('canvas')
    canvas.width = subject.width
    canvas.height = subject.height
    const context = contextFor(canvas)
    if (choice.kind === 'solid') {
      context.fillStyle = choice.color
      context.fillRect(0, 0, canvas.width, canvas.height)
    } else if (choice.kind === 'gradient') {
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, choice.colors[0])
      gradient.addColorStop(1, choice.colors[1])
      context.fillStyle = gradient
      context.fillRect(0, 0, canvas.width, canvas.height)
    } else if (choice.kind === 'image') {
      backdrop = await createImageBitmap(choice.blob)
      const scale = Math.max(canvas.width / backdrop.width, canvas.height / backdrop.height)
      const width = backdrop.width * scale, height = backdrop.height * scale
      context.drawImage(backdrop, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
      backdrop.close()
      backdrop = null
    } else if (choice.kind !== 'transparent') throw new Error('Choose a valid backdrop.')
    context.drawImage(subject, 0, 0)
    subject.close()
    subject = null
    const scale = Math.min(1, 240 / Math.max(canvas.width, canvas.height))
    preview = document.createElement('canvas')
    preview.width = Math.max(1, Math.round(canvas.width * scale))
    preview.height = Math.max(1, Math.round(canvas.height * scale))
    const previewContext = contextFor(preview)
    previewContext.imageSmoothingQuality = 'high'
    previewContext.drawImage(canvas, 0, 0, preview.width, preview.height)
    const thumbnail = await png(preview)
    const blob = choice.kind === 'transparent' ? cutout : await png(canvas)
    return { blob, thumbnail }
  } finally {
    subject?.close()
    backdrop?.close()
    for (const item of [canvas, preview]) if (item) { item.width = 0; item.height = 0 }
  }
}
