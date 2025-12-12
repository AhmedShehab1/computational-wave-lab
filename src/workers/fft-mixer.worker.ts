/// <reference lib="webworker" />

import { getFftAdapter } from '@/dsp/fftAdapter'
import type { MixerJobPayload } from '@/types'
import type { WorkerMessageEnvelope } from './types'

declare const self: DedicatedWorkerGlobalScope

let canceledJobs = new Set<string>()

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
  const maxElements = 1024 * 1024
  const first = payload.images[0] as typeof payload.images[number]
  const width = first.width
  const height = first.height
  let adapter = await getFftAdapter({ mode: modeUsed })
  if (modeUsed === 'wasm') {
    if (width * height > maxElements) {
      modeUsed = 'js'
      adapter = await getFftAdapter({ mode: 'js' })
    } else {
      try {
        adapter = await getFftAdapter({ mode: 'wasm' })
        modeUsed = 'wasm'
      } catch (err) {
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

  for (const image of payload.images) {
    if (canceledJobs.has(jobId)) throw new Error('Canceled')
    const reIn = Float32Array.from(image.pixels)
    const { re, im } = adapter.fft2d(image.width, image.height, reIn)
    emitProgress(jobId, 0.25)

    if (applyMask) applyRegionMask(re, im, image.width, image.height, mask, payload.regionMask.mode)
    applyWeights(re, im, payload.weights)
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

function applyWeights(re: Float32Array, im: Float32Array, weights: MixerJobPayload['weights']) {
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
