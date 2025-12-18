/// <reference lib="webworker" />

import { getFftAdapter } from '@/dsp/fftAdapter'
import type { MixerJobPayload, ImageSlotId, MixerMode, RegionChannelWeight } from '@/types'
import type { WorkerMessageEnvelope } from './types'

declare const self: DedicatedWorkerGlobalScope

const canceledJobs = new Set<string>()

/**
 * Build a weight map from RegionChannelWeight array
 */
function buildWeightMap(weights: RegionChannelWeight[]): Map<ImageSlotId, { w1: number; w2: number }> {
  const result = new Map<ImageSlotId, { w1: number; w2: number }>()
  for (const w of weights) {
    result.set(w.id, { w1: w.w1, w2: w.w2 })
  }
  return result
}

if (typeof self !== 'undefined') {
self.onmessage = async (event: MessageEvent<WorkerMessageEnvelope<MixerJobPayload>>) => {
  const { data } = event
  if (!data) return

  if (data.type === 'JOB_CANCEL' && data.jobId) {
    canceledJobs.add(data.jobId)
    return
  }

  if (data.type !== 'JOB_START') return

  const { jobId, payload } = data
  if (!payload) return

  try {
    const result = await runMixerJob(jobId, payload)
    if (canceledJobs.has(jobId)) {
      canceledJobs.delete(jobId)
      return
    }
    const envelope: WorkerMessageEnvelope = {
      type: 'JOB_COMPLETE',
      jobId,
      payload: result,
    }
    const transfers: Transferable[] = result.pixels ? [result.pixels.buffer] : []
    self.postMessage(envelope, transfers)
  } catch (err) {
    const envelope: WorkerMessageEnvelope = {
      type: 'JOB_ERROR',
      jobId,
      error: err instanceof Error ? err.message : 'FFT mix error',
    }
    self.postMessage(envelope)
  } finally {
    canceledJobs.delete(jobId)
  }
}
}

async function runMixerJob(jobId: string, payload: MixerJobPayload) {
  validatePayload(payload)
  let modeUsed: MixerJobPayload['fftMode'] = payload.fftMode || 'js'
  const maxElements = 4 * 1024 * 1024 // 4M pixels (e.g., 2048x2048)
  const first = payload.images[0] as typeof payload.images[number]
  const width = first.width
  const height = first.height
  let adapter = await getFftAdapter({ mode: modeUsed })
  if (modeUsed === 'wasm') {
    if (width * height > maxElements) {
      console.warn('[FFT Worker] Image too large for WASM, using JS fallback')
      modeUsed = 'js'
      adapter = await getFftAdapter({ mode: 'js' })
    } else {
      try {
        adapter = await getFftAdapter({ mode: 'wasm' })
        modeUsed = 'wasm'
      } catch (err) {
        console.warn('[FFT Worker] WASM FFT failed, falling back to JS:', err)
        modeUsed = 'js'
        adapter = await getFftAdapter({ mode: 'js' })
      }
    }
  }

  const brightnessValue = clamp(payload.brightnessConfig.value, -255, 255)
  const brightnessContrast = clamp(payload.brightnessConfig.contrast, 0.01, 10)
  const mask = normalizeRegionMask(payload.regionMask, width, height)
  const mixerMode = payload.weights.mode || 'mag-phase'

  // Build weight maps for inner and outer regions
  const innerWeights = buildWeightMap(payload.weightsInside || [])
  const outerWeights = buildWeightMap(payload.weightsOutside || [])

  // Pre-compute FFT for all images
  const fftData = new Map<ImageSlotId, { re: Float32Array; im: Float32Array }>()
  for (const image of payload.images) {
    if (canceledJobs.has(jobId)) throw new Error('Canceled')
    const reIn = Float32Array.from(image.pixels)
    const { re, im } = adapter.fft2d(image.width, image.height, reIn)
    fftData.set(image.id, { re, im })
  }
  emitProgress(jobId, 0.3)

  // Per-pixel mixing with region-based weight selection
  const accumRe = new Float32Array(width * height)
  const accumIm = new Float32Array(width * height)
  const centerX = width / 2
  const centerY = height / 2

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const dx = x - centerX
      const dy = y - centerY

      // Determine if pixel is inside the mask region
      let inside = true
      if (mask.shape === 'circle') {
        inside = Math.sqrt(dx * dx + dy * dy) <= mask.radiusPx
      } else if (mask.shape === 'rect') {
        inside = Math.abs(dx) <= mask.widthPx / 2 && Math.abs(dy) <= mask.heightPx / 2
      }

      // Select weights based on region (per-pixel content mixing!)
      const activeWeights = inside ? innerWeights : outerWeights

      // Accumulators for this pixel
      let totalMag = 0
      let totalPhase = 0
      let totalRe = 0
      let totalIm = 0

      for (const image of payload.images) {
        const fft = fftData.get(image.id)!
        const channelW = activeWeights.get(image.id) || { w1: 0, w2: 0 }

        if (mixerMode === 'real-imag') {
          // Linear Superposition
          totalRe += fft.re[idx] * channelW.w1
          totalIm += fft.im[idx] * channelW.w2
        } else {
          // Component-wise Composition (Mag/Phase mode)
          const r = fft.re[idx]
          const c = fft.im[idx]

          // Accumulate Mag and Phase separately!
          // This allows taking Mag from Image A and Phase from Image B
          const mag = Math.sqrt(r * r + c * c)
          const phase = Math.atan2(c, r)

          totalMag += mag * channelW.w1
          totalPhase += phase * channelW.w2
        }
      }

      if (mixerMode === 'real-imag') {
        accumRe[idx] = totalRe
        accumIm[idx] = totalIm
      } else {
        // Reconstruct Polar -> Rectangular
        accumRe[idx] = totalMag * Math.cos(totalPhase)
        accumIm[idx] = totalMag * Math.sin(totalPhase)
      }
    }
  }
  emitProgress(jobId, 0.7)

  const outSpatial = adapter.ifft2d(width, height, accumRe, accumIm)
  const pixels = new Uint8ClampedArray(outSpatial.length)
  for (let i = 0; i < outSpatial.length; i += 1) {
    let v = outSpatial[i]
    if (payload.brightnessConfig.target === 'spatial') {
      v = (v + brightnessValue) * brightnessContrast
    }
    v = Math.max(0, Math.min(255, v))
    pixels[i] = v
  }

  emitProgress(jobId, 1)
  adapter.dispose?.()
  return { width, height, pixels, modeUsed }
}

/** @deprecated Legacy mask function - kept for backward compatibility */
function _applyRegionMask(
  re: Float32Array,
  im: Float32Array,
  width: number,
  height: number,
  mask: ReturnType<typeof normalizeRegionMask>,
  mode: MixerJobPayload['regionMask']['mode'],
) {
  // Legacy mask function - kept for backward compatibility
  // New per-pixel mixing handles regions in the main loop
  if (mode === 'include' && mask.coverage >= 0.999) return
  const centerX = width / 2
  const centerY = height / 2

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX
      const dy = y - centerY
      let inside = true
      if (mask.shape === 'circle') {
        inside = Math.sqrt(dx * dx + dy * dy) <= mask.radiusPx
      } else if (mask.shape === 'rect') {
        inside = Math.abs(dx) <= mask.widthPx / 2 && Math.abs(dy) <= mask.heightPx / 2
      }
      const idx = y * width + x
      const keep = mode === 'include' ? inside : !inside
      if (!keep) {
        re[idx] = 0
        im[idx] = 0
      }
    }
  }
}

/** @deprecated Legacy weight application - kept for backward compatibility */
function _applyChannelWeights(
  _re: Float32Array,
  _im: Float32Array,
  _weight1: number,
  _weight2: number,
  _mode: MixerMode
) {
  // No longer used - per-pixel mixing is handled in the main loop
}

/** @deprecated Legacy weight application - kept for backward compatibility */
function _applyWeights(re: Float32Array, im: Float32Array, weights: MixerWeights) {
  const magnitude = weights.values
  const locked = weights.locked
  const len = Math.min(re.length, magnitude.length)
  for (let i = 0; i < len; i += 1) {
    const w = magnitude[i]
    re[i] *= w
    im[i] *= w
    if (locked) {
      // placeholder: lock means same scaling for paired bins; already applied
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeRegionMask(mask: MixerJobPayload['regionMask'], width: number, height: number) {
  const radiusPx = (mask.radius ?? 1) * Math.min(width, height)
  const widthPx = (mask.width ?? 1) * width
  const heightPx = (mask.height ?? 1) * height
  const coverage = mask.shape === 'circle'
    ? Math.min(1, (Math.PI * radiusPx * radiusPx) / (width * height))
    : Math.min(1, (widthPx * heightPx) / (width * height))
  return { shape: mask.shape, radiusPx, widthPx, heightPx, coverage }
}

function emitProgress(jobId: string, progress: number) {
  if (typeof self === 'undefined') return
  const envelope: WorkerMessageEnvelope = {
    type: 'JOB_PROGRESS',
    jobId,
    progress,
  }
  self.postMessage(envelope)
}

function validatePayload(payload: MixerJobPayload) {
  if (!payload.images.length) throw new Error('No images provided')
  const { width, height } = payload.images[0]!
  for (const img of payload.images) {
    if (img.width !== width || img.height !== height) {
      throw new Error('Image dimensions must match')
    }
  }
  if (!Number.isFinite(payload.brightnessConfig.contrast) || payload.brightnessConfig.contrast <= 0) {
    throw new Error('Invalid contrast')
  }
}

export { runMixerJob }
