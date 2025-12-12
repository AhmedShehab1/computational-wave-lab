export interface FftAdapter {
  fft2d(
    width: number,
    height: number,
    reIn: Float32Array | Uint8ClampedArray,
    imIn?: Float32Array,
  ): { re: Float32Array; im: Float32Array }
  ifft2d(width: number, height: number, re: Float32Array, im: Float32Array): Float32Array
}

// Simple JS adapter using naive separable passes; placeholder for production FFT.
export function createJsFftAdapter(): FftAdapter {
  const fft1d = (input: Float32Array) => naiveDft(input, false)

  return {
    fft2d(width, height, reIn, imIn) {
      const re = Float32Array.from(reIn)
      const im = imIn ? Float32Array.from(imIn) : new Float32Array(re.length)
      const rowsRe = new Float32Array(re.length)
      const rowsIm = new Float32Array(im.length)

      // Row-wise FFT
      for (let y = 0; y < height; y += 1) {
        const offset = y * width
        const rowRe = re.slice(offset, offset + width)
        const rowIm = im.slice(offset, offset + width)
        const { re: outRe, im: outIm } = fft1dComplex(rowRe, rowIm, fft1d)
        rowsRe.set(outRe, offset)
        rowsIm.set(outIm, offset)
      }

      // Column-wise FFT
      const colRe = new Float32Array(re.length)
      const colIm = new Float32Array(im.length)
      for (let x = 0; x < width; x += 1) {
        const inRe = new Float32Array(height)
        const inIm = new Float32Array(height)
        for (let y = 0; y < height; y += 1) {
          const idx = y * width + x
          inRe[y] = rowsRe[idx]
          inIm[y] = rowsIm[idx]
        }
        const { re: outRe, im: outIm } = fft1dComplex(inRe, inIm, fft1d)
        for (let y = 0; y < height; y += 1) {
          const idx = y * width + x
          colRe[idx] = outRe[y]
          colIm[idx] = outIm[y]
        }
      }

      return { re: colRe, im: colIm }
    },
    ifft2d(width, height, reIn, imIn) {
      const rowsRe = new Float32Array(reIn.length)
      const rowsIm = new Float32Array(imIn.length)

      // Row-wise IFFT
      for (let y = 0; y < height; y += 1) {
        const offset = y * width
        const rowRe = reIn.slice(offset, offset + width)
        const rowIm = imIn.slice(offset, offset + width)
        const { re: outRe, im: outIm } = fft1dComplex(rowRe, rowIm, (input) => naiveDft(input, true))
        rowsRe.set(outRe, offset)
        rowsIm.set(outIm, offset)
      }

      // Column-wise IFFT
      const out = new Float32Array(reIn.length)
      for (let x = 0; x < width; x += 1) {
        const inRe = new Float32Array(height)
        const inIm = new Float32Array(height)
        for (let y = 0; y < height; y += 1) {
          const idx = y * width + x
          inRe[y] = rowsRe[idx]
          inIm[y] = rowsIm[idx]
        }
        const { re: outRe } = fft1dComplex(inRe, inIm, (input) => naiveDft(input, true))
        for (let y = 0; y < height; y += 1) {
          const idx = y * width + x
          out[idx] = outRe[y] / (width * height)
        }
      }

      return out
    },
  }
}

export async function createWasmFftAdapter(): Promise<FftAdapter> {
  // TODO: integrate kissfft-js or similar wasm-backed FFT
  throw new Error('WASM FFT adapter not implemented')
}

export function getFftAdapter(options: { mode?: 'js' | 'wasm' } = {}): FftAdapter {
  const mode = options.mode ?? 'js'
  if (mode === 'wasm') {
    // For now fallback to JS until WASM is wired
    return createJsFftAdapter()
  }
  return createJsFftAdapter()
}

function fft1dComplex(
  re: Float32Array,
  _im: Float32Array,
  fftFn: (input: Float32Array) => { re: Float32Array; im: Float32Array },
) {
  const n = re.length
  const complex = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    complex[i] = re[i]
  }
  const { re: outRe, im: outIm } = fftFn(complex)
  return { re: outRe, im: outIm }
}

// Naive DFT for small sizes; placeholder until optimized FFT is added.
function naiveDft(input: Float32Array, inverse: boolean) {
  const n = input.length
  const outRe = new Float32Array(n)
  const outIm = new Float32Array(n)
  const sign = inverse ? 1 : -1
  for (let k = 0; k < n; k += 1) {
    let sumRe = 0
    let sumIm = 0
    for (let t = 0; t < n; t += 1) {
      const angle = (2 * Math.PI * t * k) / n
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      sumRe += input[t] * cos
      sumIm += input[t] * sin * sign
    }
    outRe[k] = sumRe
    outIm[k] = sumIm
  }
  return { re: outRe, im: outIm }
}
