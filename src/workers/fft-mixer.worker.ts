/// <reference lib="webworker" />

import { getFftAdapter } from '@/dsp/fftAdapter'
import type { MixerJobPayload, MixerWeights, ImageSlotId, MixerMode } from '@/types'
import type { WorkerMessageEnvelope } from './types'

declare const self: DedicatedWorkerGlobalScope

const canceledJobs = new Set<string>()

/**
 * Compute effective weights considering mute/solo states
 * Falls back to legacy weight values if channels array is missing
 */
function computeEffectiveWeights(weights: MixerWeights, _imageIds: ImageSlotId[]): Map<ImageSlotId, { w1: number; w2: number }> {
  const result = new Map<ImageSlotId, { w1: number; w2: number }>()
  const channels = weights.channels ?? []
  
  // If no channels defined, fall back to legacy values array
  if (channels.length === 0) {
    const legacyValues = weights.values ?? [1, 1, 1, 1]
    const slotIds: ImageSlotId[] = ['A', 'B', 'C', 'D']
    for (let i = 0; i < slotIds.length; i++) {
      const w = legacyValues[i] ?? 1
      result.set(slotIds[i], { w1: w, w2: w })
    }
    return result
  }
  
  // Check if any channel has solo active
  const soloActive = channels.some((ch) => ch.solo)
  
  for (const ch of channels) {
    let w1: number
    let w2: number
    
    if (ch.muted) {
      // Muted channels contribute nothing
      w1 = 0
      w2 = 0
    } else if (soloActive) {
      // Solo mode: only soloed channels contribute
      if (ch.solo) {
        w1 = ch.weight1
        w2 = ch.weight2
      } else {
        w1 = 0
        w2 = 0
      }
    } else {
      // Normal mode
      w1 = ch.weight1
      w2 = ch.weight2
    }
    
    result.set(ch.id, { w1, w2 })
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
  const applyMask = mask.coverage < 1 || payload.regionMask.mode === 'exclude'

  const accumRe = new Float32Array(width * height)
  const accumIm = new Float32Array(width * height)

  // Compute effective weights (handles mute/solo logic)
  const imageIds = payload.images.map((img) => img.id)
  const effectiveWeights = computeEffectiveWeights(payload.weights, imageIds)
  const mixerMode = payload.weights.mode || 'mag-phase'

  for (const image of payload.images) {
    if (canceledJobs.has(jobId)) throw new Error('Canceled')
    
    const channelWeights = effectiveWeights.get(image.id) || { w1: 1, w2: 1 }
    const reIn = Float32Array.from(image.pixels)
    const { re, im } = adapter.fft2d(image.width, image.height, reIn)
    emitProgress(jobId, 0.25)

    if (applyMask) applyRegionMask(re, im, image.width, image.height, mask, payload.regionMask.mode)
    
    // Apply 2D weights based on mixer mode
    applyChannelWeights(re, im, channelWeights.w1, channelWeights.w2, mixerMode)
    emitProgress(jobId, 0.55)

    for (let i = 0; i < accumRe.length; i += 1) {
      accumRe[i] += re[i]
      accumIm[i] += im[i]
    }
  }

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

function applyRegionMask(
  re: Float32Array,
  im: Float32Array,
  width: number,
  height: number,
  mask: ReturnType<typeof normalizeRegionMask>,
  mode: MixerJobPayload['regionMask']['mode'],
) {
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

/**
 * Apply 2D weights to FFT data based on mixer mode
 * 
 * In mag-phase mode:
 *   - weight1 scales magnitude: mag' = mag * w1
 *   - weight2 scales phase offset (additive): phase' = phase * w2
 *   - Re-compose: re = mag' * cos(phase'), im = mag' * sin(phase')
 * 
 * In real-imag mode:
 *   - weight1 directly scales real part: re' = re * w1
 *   - weight2 directly scales imaginary part: im' = im * w2
 */
function applyChannelWeights(
  re: Float32Array,
  im: Float32Array,
  weight1: number,
  weight2: number,
  mode: MixerMode
) {
  const len = re.length
  
  if (mode === 'real-imag') {
    // Direct scaling of real and imaginary parts
    for (let i = 0; i < len; i++) {
      re[i] *= weight1
      im[i] *= weight2
    }
  } else {
    // Magnitude-Phase mode (default)
    for (let i = 0; i < len; i++) {
      const r = re[i]
      const c = im[i]
      
      // Convert to polar
      const mag = Math.sqrt(r * r + c * c)
      const phase = Math.atan2(c, r)
      
      // Scale magnitude by weight1
      const scaledMag = mag * weight1
      
      // Scale phase by weight2 (multiplicative to preserve structure)
      const scaledPhase = phase * weight2
      
      // Convert back to cartesian
      re[i] = scaledMag * Math.cos(scaledPhase)
      im[i] = scaledMag * Math.sin(scaledPhase)
    }
  }
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
