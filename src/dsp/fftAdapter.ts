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

export async function createWasmFftAdapter(): Promise<FftAdapter> {
  const kiss = await loadKissModule()
  const FFTCtor = (kiss as any).FFT || (kiss as any).default?.FFT
  if (!FFTCtor) throw new Error('kissfft FFT not available')

  const cache = new Map<number, { fft: any; inBuf: Float32Array; tmpRe: Float32Array; tmpIm: Float32Array }>()

  const getFft = (size: number) => {
    // Ensure size is power of two before creating FFT instance
    if (!isPowerOfTwo(size)) {
      throw new Error(`Internal error: getFft called with non-power-of-two size ${size}`)
    }
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
    
    // Ensure we're working with power-of-two size
    const paddedSize = isPowerOfTwo(size) ? size : nextPowerOfTwo(size)
    
    let workRe = re
    let workIm = im
    if (paddedSize !== size) {
      // Pad to power of two
      workRe = new Float32Array(paddedSize)
      workIm = new Float32Array(paddedSize)
      workRe.set(re)
      workIm.set(im)
    }
    
    const { fft, inBuf } = getFft(paddedSize)
    for (let i = 0; i < paddedSize; i += 1) {
      inBuf[2 * i] = workRe[i]
      inBuf[2 * i + 1] = workIm[i]
    }
    const out = fft.forward(inBuf)
    
    // Return at padded size (caller will handle unpadding at 2D level)
    const outRe = new Float32Array(paddedSize)
    const outIm = new Float32Array(paddedSize)
    for (let i = 0; i < paddedSize; i += 1) {
      outRe[i] = out[2 * i]
      outIm[i] = out[2 * i + 1]
    }
    return { re: outRe, im: outIm, paddedSize }
  }

  const inverse1d = (re: Float32Array, im: Float32Array, origSize?: number) => {
    const size = re.length
    if (size <= 1) return { re: Float32Array.from(re), im: Float32Array.from(im) }
    
    // Size should already be power of two from forward transform
    // But double-check and pad if needed
    const paddedSize = isPowerOfTwo(size) ? size : nextPowerOfTwo(size)
    
    let workRe = re
    let workIm = im
    if (paddedSize !== size) {
      workRe = new Float32Array(paddedSize)
      workIm = new Float32Array(paddedSize)
      workRe.set(re)
      workIm.set(im)
    }
    
    const { fft, inBuf } = getFft(paddedSize)
    for (let i = 0; i < paddedSize; i += 1) {
      inBuf[2 * i] = workRe[i]
      inBuf[2 * i + 1] = -workIm[i]
    }
    const out = fft.forward(inBuf)
    const norm = paddedSize
    
    // Return at original size if specified, otherwise padded size
    const outSize = origSize ?? paddedSize
    const outRe = new Float32Array(outSize)
    const outIm = new Float32Array(outSize)
    for (let i = 0; i < outSize; i += 1) {
      outRe[i] = out[2 * i] / norm
      outIm[i] = -out[2 * i + 1] / norm
    }
    return { re: outRe, im: outIm }
  }

  // Pad 2D array to next power of two dimensions
  const padToPow2 = (data: Float32Array, width: number, height: number, paddedW: number, paddedH: number) => {
    const padded = new Float32Array(paddedW * paddedH)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        padded[y * paddedW + x] = data[y * width + x]
      }
    }
    return padded
  }

  // Extract original size from padded result
  const unpad = (data: Float32Array, paddedW: number, origW: number, origH: number) => {
    const result = new Float32Array(origW * origH)
    for (let y = 0; y < origH; y++) {
      for (let x = 0; x < origW; x++) {
        result[y * origW + x] = data[y * paddedW + x]
      }
    }
    return result
  }

  const adapter: FftAdapter = {
    fft2d(width, height, reIn, imIn) {
      // Calculate padded dimensions (must be power of two for kissfft)
      const paddedW = isPowerOfTwo(width) ? width : nextPowerOfTwo(width)
      const paddedH = isPowerOfTwo(height) ? height : nextPowerOfTwo(height)
      
      // Pad input to power-of-two dimensions
      const re = padToPow2(Float32Array.from(reIn), width, height, paddedW, paddedH)
      const im = imIn 
        ? padToPow2(Float32Array.from(imIn), width, height, paddedW, paddedH) 
        : new Float32Array(paddedW * paddedH)
      
      const rowsRe = new Float32Array(paddedW * paddedH)
      const rowsIm = new Float32Array(paddedW * paddedH)

      // Row pass using padded width
      for (let y = 0; y < paddedH; y += 1) {
        const offset = y * paddedW
        const rowRe = re.subarray(offset, offset + paddedW)
        const rowIm = im.subarray(offset, offset + paddedW)
        const { re: outRe, im: outIm } = forward1d(rowRe, rowIm)
        rowsRe.set(outRe, offset)
        rowsIm.set(outIm, offset)
      }

      // Column pass using padded height
      const colRe = new Float32Array(paddedW * paddedH)
      const colIm = new Float32Array(paddedW * paddedH)
      for (let x = 0; x < paddedW; x += 1) {
        const inRe = new Float32Array(paddedH)
        const inIm = new Float32Array(paddedH)
        for (let y = 0; y < paddedH; y += 1) {
          const idx = y * paddedW + x
          inRe[y] = rowsRe[idx]
          inIm[y] = rowsIm[idx]
        }
        const { re: outRe, im: outIm } = forward1d(inRe, inIm)
        for (let y = 0; y < paddedH; y += 1) {
          const idx = y * paddedW + x
          colRe[idx] = outRe[y]
          colIm[idx] = outIm[y]
        }
      }

      // Return unpadded result at original dimensions
      return { 
        re: unpad(colRe, paddedW, width, height), 
        im: unpad(colIm, paddedW, width, height) 
      }
    },

    ifft2d(width, height, reIn, imIn) {
      // Calculate padded dimensions
      const paddedW = isPowerOfTwo(width) ? width : nextPowerOfTwo(width)
      const paddedH = isPowerOfTwo(height) ? height : nextPowerOfTwo(height)
      
      // Pad input to power-of-two dimensions
      const re = padToPow2(Float32Array.from(reIn), width, height, paddedW, paddedH)
      const im = padToPow2(Float32Array.from(imIn), width, height, paddedW, paddedH)
      
      const rowsRe = new Float32Array(paddedW * paddedH)
      const rowsIm = new Float32Array(paddedW * paddedH)

      // Row pass
      for (let y = 0; y < paddedH; y += 1) {
        const offset = y * paddedW
        const rowRe = re.subarray(offset, offset + paddedW)
        const rowIm = im.subarray(offset, offset + paddedW)
        const { re: outRe, im: outIm } = inverse1d(rowRe, rowIm)
        rowsRe.set(outRe, offset)
        rowsIm.set(outIm, offset)
      }

      // Column pass
      const outPadded = new Float32Array(paddedW * paddedH)
      for (let x = 0; x < paddedW; x += 1) {
        const inRe = new Float32Array(paddedH)
        const inIm = new Float32Array(paddedH)
        for (let y = 0; y < paddedH; y += 1) {
          const idx = y * paddedW + x
          inRe[y] = rowsRe[idx]
          inIm[y] = rowsIm[idx]
        }
        const { re: outRe } = inverse1d(inRe, inIm)
        for (let y = 0; y < paddedH; y += 1) {
          const idx = y * paddedW + x
          outPadded[idx] = outRe[y]
        }
      }

      // Return unpadded result
      return unpad(outPadded, paddedW, width, height)
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
