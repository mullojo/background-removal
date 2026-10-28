// One geometry calculation drives both the preview and PNG export. New ratios
// stay within the source's longest edge and pixel count to limit mobile memory.
export const FRAME_RATIOS = [
  { id: 'original', label: 'Original photo', ratio: null },
  { id: '1:1', label: 'Square · 1:1', ratio: 1 },
  { id: '4:5', label: 'Portrait · 4:5', ratio: 4 / 5 },
  { id: '3:4', label: 'Portrait · 3:4', ratio: 3 / 4 },
  { id: '9:16', label: 'Story · 9:16', ratio: 9 / 16 },
  { id: '4:3', label: 'Landscape · 4:3', ratio: 4 / 3 },
  { id: '3:2', label: 'Landscape · 3:2', ratio: 3 / 2 },
  { id: '16:9', label: 'Wide · 16:9', ratio: 16 / 9 },
]

export function outputFrame(sourceWidth, sourceHeight, ratioId = 'original', placement = 'fit') {
  const originalWidth = Math.max(1, sourceWidth)
  const originalHeight = Math.max(1, sourceHeight)
  const ratio = FRAME_RATIOS.find(item => item.id === ratioId)?.ratio
  const edge = Math.max(originalWidth, originalHeight)
  let width = ratio ? Math.max(1, Math.round(ratio >= 1 ? edge : edge * ratio)) : originalWidth
  let height = ratio ? Math.max(1, Math.round(ratio >= 1 ? edge / ratio : edge)) : originalHeight
  const budgetScale = Math.min(1, Math.sqrt(originalWidth * originalHeight / (width * height)))
  if (budgetScale < 1) {
    width = Math.max(1, Math.floor(width * budgetScale))
    height = Math.max(1, Math.floor(height * budgetScale))
  }
  const scale = (placement === 'fill' ? Math.max : Math.min)(width / originalWidth, height / originalHeight)
  const photoWidth = originalWidth * scale
  const photoHeight = originalHeight * scale
  return {
    width, height,
    photo: { x: (width - photoWidth) / 2, y: (height - photoHeight) / 2, width: photoWidth, height: photoHeight },
  }
}
