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

// Anchors work for both added space (fit) and which edge survives a crop (fill).
export const FRAME_ANCHORS = [
  { id: 'top-left', label: 'Top left', x: 0, y: 0 },
  { id: 'top', label: 'Top', x: .5, y: 0 },
  { id: 'top-right', label: 'Top right', x: 1, y: 0 },
  { id: 'left', label: 'Left', x: 0, y: .5 },
  { id: 'center', label: 'Center', x: .5, y: .5 },
  { id: 'right', label: 'Right', x: 1, y: .5 },
  { id: 'bottom-left', label: 'Bottom left', x: 0, y: 1 },
  { id: 'bottom', label: 'Bottom', x: .5, y: 1 },
  { id: 'bottom-right', label: 'Bottom right', x: 1, y: 1 },
]

export function outputFrame(sourceWidth, sourceHeight, ratioId = 'original', placement = 'fit', anchorId = 'center') {
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
  const anchor = FRAME_ANCHORS.find(item => item.id === anchorId) || FRAME_ANCHORS[4]
  return {
    width, height,
    photo: { x: (width - photoWidth) * anchor.x, y: (height - photoHeight) * anchor.y, width: photoWidth, height: photoHeight },
  }
}

// Express the full workspace in output-pixel coordinates. Backgrounds are drawn
// once over this area; the PNG takes the exact rectangle inside the outline.
export function frameViewport(frame, stageWidth, stageHeight) {
  if (!(stageWidth > 0 && stageHeight > 0)) return { x: 0, y: 0, width: frame.width, height: frame.height }
  const scale = Math.min(stageWidth / frame.width, stageHeight / frame.height)
  const width = Math.max(frame.width, stageWidth / scale), height = Math.max(frame.height, stageHeight / scale)
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height }
}

// Read the existing small inference mask, never a full-size decoded photo. A
// sustained opaque run near an edge suggests a subject cut off by that edge.
// Ignore isolated specks; ambiguous opposite-edge contact stays centered.
export function detectMaskAnchor({ width, height, channels = 1, pixels }) {
  if (width < 16 || height < 16 || !pixels || pixels.length < width * height * channels) return 'center'
  const band = Math.max(1, Math.round(Math.min(width, height) * .01))
  function contact(horizontal, end) {
    const length = horizontal ? width : height
    let run = 0, longest = 0
    for (let position = 0; position < length; position++) {
      let opaque = false
      for (let depth = 0; depth < band; depth++) {
        const x = horizontal ? position : end ? width - 1 - depth : depth
        const y = horizontal ? end ? height - 1 - depth : depth : position
        if (pixels[(y * width + x) * channels] >= 192) { opaque = true; break }
      }
      run = opaque ? run + 1 : 0
      longest = Math.max(longest, run)
    }
    return longest >= Math.max(3, Math.ceil(length * .06)) ? longest / length : 0
  }
  function direction(start, end) {
    if (start > 0 && start > end * 1.6) return 0
    if (end > 0 && end > start * 1.6) return 1
    return .5
  }
  const x = direction(contact(false, false), contact(false, true))
  const y = direction(contact(true, false), contact(true, true))
  return FRAME_ANCHORS.find(anchor => anchor.x === x && anchor.y === y).id
}
