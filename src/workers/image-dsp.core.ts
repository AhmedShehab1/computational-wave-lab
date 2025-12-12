export function toGrayscale(rgba: Uint8ClampedArray, width: number, height: number) {
  const size = width * height
  const gray = new Uint8ClampedArray(size)
  for (let i = 0; i < size; i += 1) {
    const idx = i * 4
    const r = rgba[idx]
    const g = rgba[idx + 1]
    const b = rgba[idx + 2]
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  return gray
}
