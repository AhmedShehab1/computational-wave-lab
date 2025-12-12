export const viridis = (t: number) => {
  const clamped = Math.max(0, Math.min(1, t))
  const r = Math.round(255 * (0.267 + clamped * (0.993 - 0.267)))
  const g = Math.round(255 * (0.004 + clamped * (0.906 - 0.004)))
  const b = Math.round(255 * (0.329 + clamped * (0.635 - 0.329)))
  return [r, g, b] as const
}

export const mapHeatmapToImageData = (heatmap: Float32Array, width: number, height: number) => {
  const pixels = new Uint8ClampedArray(width * height * 4)
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < heatmap.length; i++) {
    const v = heatmap[i]
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min || 1
  for (let i = 0; i < heatmap.length; i++) {
    const tRaw = (heatmap[i] - min) / range
    const t = Math.max(0, Math.min(1, Number.isFinite(tRaw) ? tRaw : 0))
    const [r, g, b] = viridis(t)
    const idx = i * 4
    pixels[idx] = r
    pixels[idx + 1] = g
    pixels[idx + 2] = b
    pixels[idx + 3] = 255
  }
  return pixels
}
