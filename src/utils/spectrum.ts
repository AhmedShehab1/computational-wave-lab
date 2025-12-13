import FFT from 'fft.js'

// Helper to check if a number is a power of two
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

// Helper to get next power of two
function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 2
  n--
  n |= n >> 1
  n |= n >> 2
  n |= n >> 4
  n |= n >> 8
  n |= n >> 16
  return n + 1
}

export function computeRowSpectrum(pixels: Uint8ClampedArray, width: number, height: number): Float32Array {
  if (!width || !height) return new Float32Array()
  
  // Pad width to power of two for FFT
  const paddedWidth = isPowerOfTwo(width) ? width : nextPowerOfTwo(width)
  const fft = new FFT(paddedWidth)
  const accum = new Float32Array(paddedWidth)
  const tempIn = fft.createComplexArray()
  const tempOut = fft.createComplexArray()

  for (let row = 0; row < height; row += 1) {
    // Zero out the input array
    tempIn.fill(0)
    
    // Fill with actual pixel data (zero-padded beyond width)
    for (let x = 0; x < width; x += 1) {
      const idx = row * width + x
      tempIn[2 * x] = pixels[idx]
      tempIn[2 * x + 1] = 0
    }
    fft.transform(tempOut, tempIn)
    for (let x = 0; x < paddedWidth; x += 1) {
      const re = tempOut[2 * x]
      const im = tempOut[2 * x + 1]
      accum[x] += Math.sqrt(re * re + im * im)
    }
  }

  // Return spectrum at original width (unpadded)
  const out = new Float32Array(width)
  const norm = height || 1
  for (let x = 0; x < width; x += 1) {
    out[x] = accum[x] / norm
  }
  return out
}
