import FFT from 'fft.js'

export function computeRowSpectrum(pixels: Uint8ClampedArray, width: number, height: number): Float32Array {
  if (!width || !height) return new Float32Array()
  const fft = new FFT(width)
  const accum = new Float32Array(width)
  const tempIn = fft.createComplexArray()
  const tempOut = fft.createComplexArray()

  for (let row = 0; row < height; row += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = row * width + x
      tempIn[2 * x] = pixels[idx]
      tempIn[2 * x + 1] = 0
    }
    fft.transform(tempOut, tempIn)
    for (let x = 0; x < width; x += 1) {
      const re = tempOut[2 * x]
      const im = tempOut[2 * x + 1]
      accum[x] += Math.sqrt(re * re + im * im)
    }
  }

  const out = new Float32Array(width)
  const norm = height || 1
  for (let x = 0; x < width; x += 1) {
    out[x] = accum[x] / norm
  }
  return out
}
