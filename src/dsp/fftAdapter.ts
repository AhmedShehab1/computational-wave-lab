import FFT from 'fft.js'

export interface FftAdapter {
  fft2d(
    width: number,
    height: number,
    reIn: Float32Array | Uint8ClampedArray,
    imIn?: Float32Array,
  ): { re: Float32Array; im: Float32Array }
  ifft2d(width: number, height: number, re: Float32Array, im: Float32Array): Float32Array
}

// JS path uses fft.js for separable 2D FFT; wasm path can swap in via fftMode='wasm' once COOP/COEP is set.
export function createJsFftAdapter(): FftAdapter {
  const cache = new Map<number, FFT>()

  const getFft = (size: number) => {
    if (!cache.has(size)) cache.set(size, new FFT(size))
    return cache.get(size) as FFT
  }

  const fft1d = (re: Float32Array, im: Float32Array, inverse = false) => {
    const size = re.length
    const fft = getFft(size)
    const input = new Float32Array(fft.createComplexArray())
    for (let i = 0; i < size; i += 1) {
      input[2 * i] = re[i]
      input[2 * i + 1] = im[i]
    }
    const out = new Float32Array(fft.createComplexArray())
    if (inverse) {
      ;(fft as unknown as { inverse: (out: Float32Array, input: Float32Array) => void }).inverse(out, input)
    } else {
      fft.transform(out, input)
    }
    const outRe = new Float32Array(size)
    const outIm = new Float32Array(size)
    for (let i = 0; i < size; i += 1) {
      outRe[i] = out[2 * i]
      outIm[i] = out[2 * i + 1]
    }
    return { re: outRe, im: outIm }
  }

  return {
    fft2d(width, height, reIn, imIn) {
      const re = Float32Array.from(reIn)
      const im = imIn ? Float32Array.from(imIn) : new Float32Array(re.length)
      const rowsRe = new Float32Array(re.length)
      const rowsIm = new Float32Array(im.length)

      // Row pass
      for (let y = 0; y < height; y += 1) {
        const offset = y * width
        const rowRe = re.subarray(offset, offset + width)
        const rowIm = im.subarray(offset, offset + width)
        const { re: outRe, im: outIm } = fft1d(rowRe, rowIm, false)
        rowsRe.set(outRe, offset)
        rowsIm.set(outIm, offset)
      }

      // Column pass
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
        const { re: outRe, im: outIm } = fft1d(inRe, inIm, false)
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

      for (let y = 0; y < height; y += 1) {
        const offset = y * width
        const rowRe = reIn.subarray(offset, offset + width)
        const rowIm = imIn.subarray(offset, offset + width)
        const { re: outRe, im: outIm } = fft1d(rowRe, rowIm, true)
        rowsRe.set(outRe, offset)
        rowsIm.set(outIm, offset)
      }

      const out = new Float32Array(reIn.length)
      for (let x = 0; x < width; x += 1) {
        const inRe = new Float32Array(height)
        const inIm = new Float32Array(height)
        for (let y = 0; y < height; y += 1) {
          const idx = y * width + x
          inRe[y] = rowsRe[idx]
          inIm[y] = rowsIm[idx]
        }
        const { re: outRe } = fft1d(inRe, inIm, true)
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
  // TODO: integrate kissfft-js or similar wasm-backed FFT once COOP/COEP is enabled
  throw new Error('WASM FFT adapter not implemented')
}

export function getFftAdapter(options: { mode?: 'js' | 'wasm' } = {}): FftAdapter {
  const mode = options.mode ?? 'js'
  if (mode === 'wasm') {
    return createJsFftAdapter()
  }
  return createJsFftAdapter()
}
