/// <reference lib="webworker" />

import type { WorkerMessageEnvelope } from './types'
import { toGrayscale } from './image-dsp.core'

type StartPayload = {
  fileArrayBuffer?: ArrayBuffer
  fileType?: string
  targetSize?: { width: number; height: number }
  width?: number
  height?: number
  pixels?: Uint8ClampedArray
}

type InboundMessage = WorkerMessageEnvelope<StartPayload>

declare const self: DedicatedWorkerGlobalScope

const canceled = new Set<string>()

self.onmessage = async (event: MessageEvent<InboundMessage>) => {
  const { data } = event
  if (!data) return

  if (data.type === 'JOB_CANCEL' && data.jobId) {
    canceled.add(data.jobId)
    return
  }

  if (data.type !== 'JOB_START') return

  const { jobId, payload } = data
  if (!jobId || !payload) return

  try {
    const { width, height, pixels } = await processPayload(jobId, payload)
    if (canceled.has(jobId)) {
      canceled.delete(jobId)
      return
    }
    const grayscale = toGrayscale(pixels, width, height)
    const result: WorkerMessageEnvelope = {
      type: 'JOB_COMPLETE',
      jobId,
      payload: { width, height, pixels: grayscale },
    }
    self.postMessage(result, [grayscale.buffer])
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker error'
    const envelope: WorkerMessageEnvelope = {
      type: 'JOB_ERROR',
      jobId,
      error: message,
    }
    self.postMessage(envelope)
  } finally {
    canceled.delete(jobId)
  }
}

async function processPayload(jobId: string, payload: StartPayload) {
  if (payload.pixels && payload.width && payload.height) {
    return { width: payload.width, height: payload.height, pixels: payload.pixels }
  }

  if (!payload.fileArrayBuffer || !payload.fileType) {
    throw new Error('Missing file buffer or type')
  }

  const blob = new Blob([payload.fileArrayBuffer], { type: payload.fileType })
  const bitmap = await createBitmap(blob)
  if (canceled.has(jobId)) throw new Error('Canceled')

  const targetWidth = payload.targetSize?.width ?? bitmap.width
  const targetHeight = payload.targetSize?.height ?? bitmap.height
  const { rgba, width, height } = drawToCanvas(bitmap, targetWidth, targetHeight)
  return { width, height, pixels: rgba }
}

async function createBitmap(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob)
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((b) => {
        if (!b) {
          reject(new Error('Failed to convert image'))
          return
        }
        if (typeof createImageBitmap === 'function') {
          createImageBitmap(b).then(resolve).catch(reject)
        } else {
          reject(new Error('ImageBitmap not supported'))
        }
      })
    }
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = URL.createObjectURL(blob)
  })
}

function drawToCanvas(bitmap: ImageBitmap, width: number, height: number) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    return { rgba: data, width, height }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  return { rgba: data, width, height }
}
