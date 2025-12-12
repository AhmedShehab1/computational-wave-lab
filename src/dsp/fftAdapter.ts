import FFT from 'fft.js'

export interface FftAdapter {
  fft2d(
    width: number,
    height: number,
    reIn: Float32Array | Uint8ClampedArray,
    imIn?: Float32Array,
  ): { re: Float32Array; im: Float32Array }
  ifft2d(width: number, height: number, re: Float32Array, im: Float32Array): Float32Array
  dispose?: () => void
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
    if (size <= 1) {
      return { re: Float32Array.from(re), im: Float32Array.from(im) }
    }
    const fft = getFft(size)
    const input = new Float32Array(fft.createComplexArray())
    for (let i = 0; i < size; i += 1) {
      input[2 * i] = re[i]
      input[2 * i + 1] = im[i]
    }
    const out = new Float32Array(fft.createComplexArray())
    if (inverse) {
      ;(fft as unknown as { inverseTransform: (out: Float32Array, input: Float32Array) => void }).inverseTransform(out, input)
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
            out[idx] = outRe[y]
        }
      }

      return out
    },
  }
}

let kissModulePromise: Promise<typeof import('kissfft-js')> | null = null

async function loadKissModule() {
  if (!kissModulePromise) {
    kissModulePromise = import('kissfft-js')
  }
  return kissModulePromise
}

export async function createWasmFftAdapter(): Promise<FftAdapter> {
  const kiss = await loadKissModule()
  const FFTCtor = (kiss as any).FFT || (kiss as any).default?.FFT
  if (!FFTCtor) throw new Error('kissfft FFT not available')

  const cache = new Map<number, { fft: any; inBuf: Float32Array; tmpRe: Float32Array; tmpIm: Float32Array }>()

  const getFft = (size: number) => {
    if (!cache.has(size)) {
      const fft = new FFTCtor(size)
      cache.set(size, {
        fft,
        inBuf: new Float32Array(size * 2),
        tmpRe: new Float32Array(size),
        tmpIm: new Float32Array(size),
      })
    }
    return cache.get(size) as { fft: any; inBuf: Float32Array; tmpRe: Float32Array; tmpIm: Float32Array }
  }

  const forward1d = (re: Float32Array, im: Float32Array) => {
    const size = re.length
    if (size <= 1) return { re: Float32Array.from(re), im: Float32Array.from(im) }
    const { fft, inBuf, tmpRe, tmpIm } = getFft(size)
    for (let i = 0; i < size; i += 1) {
      inBuf[2 * i] = re[i]
      inBuf[2 * i + 1] = im[i]
    }
    const out = fft.forward(inBuf)
    for (let i = 0; i < size; i += 1) {
      tmpRe[i] = out[2 * i]
      tmpIm[i] = out[2 * i + 1]
    }
    return { re: Float32Array.from(tmpRe), im: Float32Array.from(tmpIm) }
  }

  const inverse1d = (re: Float32Array, im: Float32Array) => {
    const size = re.length
    if (size <= 1) return { re: Float32Array.from(re), im: Float32Array.from(im) }
    const { fft, inBuf, tmpRe, tmpIm } = getFft(size)
    for (let i = 0; i < size; i += 1) {
      inBuf[2 * i] = re[i]
      inBuf[2 * i + 1] = -im[i]
    }
    const out = fft.forward(inBuf)
    const norm = size
    for (let i = 0; i < size; i += 1) {
      tmpRe[i] = out[2 * i] / norm
      tmpIm[i] = -out[2 * i + 1] / norm
    }
    return { re: Float32Array.from(tmpRe), im: Float32Array.from(tmpIm) }
  }

  const adapter: FftAdapter = {
    fft2d(width, height, reIn, imIn) {
      const re = Float32Array.from(reIn)
      const im = imIn ? Float32Array.from(imIn) : new Float32Array(re.length)
      const rowsRe = new Float32Array(re.length)
      const rowsIm = new Float32Array(im.length)

      for (let y = 0; y < height; y += 1) {
        const offset = y * width
        const rowRe = re.subarray(offset, offset + width)
        const rowIm = im.subarray(offset, offset + width)
        const { re: outRe, im: outIm } = forward1d(rowRe, rowIm)
        rowsRe.set(outRe, offset)
        rowsIm.set(outIm, offset)
      }

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
        const { re: outRe, im: outIm } = forward1d(inRe, inIm)
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
        const { re: outRe, im: outIm } = inverse1d(rowRe, rowIm)
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
        const { re: outRe } = inverse1d(inRe, inIm)
        for (let y = 0; y < height; y += 1) {
          const idx = y * width + x
          out[idx] = outRe[y]
        }
      }

      return out
    },

    dispose() {
      cache.forEach((entry) => {
        if (entry.fft?.dispose) entry.fft.dispose()
      })
      cache.clear()
    },
  }

  return adapter
}

export async function getFftAdapter(options: { mode?: 'js' | 'wasm' } = {}): Promise<FftAdapter> {
  const mode = options.mode ?? 'js'
  if (mode === 'wasm') {
    return createWasmFftAdapter()
  }
  return createJsFftAdapter()
}
