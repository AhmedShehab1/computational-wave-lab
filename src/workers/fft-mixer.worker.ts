/// <reference lib="webworker" />

import { getFftAdapter } from '@/dsp/fftAdapter'
import type { MixerJobPayload } from '@/types'
import type { WorkerMessageEnvelope } from './types'

declare const self: DedicatedWorkerGlobalScope

let canceledJobs = new Set<string>()

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

async function runMixerJob(jobId: string, payload: MixerJobPayload) {
  const adapter = getFftAdapter({ mode: payload.fftMode || 'js' })
  const first = payload.images[0]
  if (!first) throw new Error('No images provided')
  const width = first.width
  const height = first.height

  const accumRe = new Float32Array(width * height)
  const accumIm = new Float32Array(width * height)

  for (const image of payload.images) {
    if (canceledJobs.has(jobId)) throw new Error('Canceled')
    const reIn = Float32Array.from(image.pixels)
    const { re, im } = adapter.fft2d(image.width, image.height, reIn)

    applyRegionMask(re, im, image.width, image.height, payload.regionMask)
    applyWeights(re, im, payload.weights)

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
      v = (v + payload.brightnessConfig.value) * payload.brightnessConfig.contrast
    }
    v = Math.max(0, Math.min(255, v))
    pixels[i] = v
  }

  return { width, height, pixels }
}

function applyRegionMask(
  re: Float32Array,
  im: Float32Array,
  width: number,
  height: number,
  mask: MixerJobPayload['regionMask'],
) {
  // Placeholder: simple include/exclude radius centered mask
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.min(width, height) * (mask.radius ?? 1)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX
      const dy = y - centerY
      const inside = Math.sqrt(dx * dx + dy * dy) <= radius
      const idx = y * width + x
      const apply = mask.mode === 'include' ? inside : !inside
      if (!apply) {
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
