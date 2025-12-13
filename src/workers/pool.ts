import { workerPoolConfig } from '@/config/runtime'
import type { WorkerPoolConfig } from '@/types'
import type { JobToken, WorkerMessageEnvelope } from './types'

export type WorkerJobType = 'image-dsp' | 'beam-sim'

interface WorkerJob<TPayload = unknown> {
  id: JobToken
  payload: TPayload
    onProgress?: (progress: number) => void
}

interface WorkerEntry {
  worker: Worker
  busy: boolean
  jobId?: JobToken
}

type CreateWorkerFn = () => Worker

export class WorkerManager<TPayload = unknown> {
  private config: WorkerPoolConfig
  private createWorker: CreateWorkerFn
  private queue: WorkerJob<TPayload>[] = []
  private workers: WorkerEntry[] = []
  private handlers = new Map<
    JobToken,
    {
      resolve: (value: unknown) => void
      reject: (reason?: unknown) => void
      onProgress?: (progress: number) => void
      worker?: WorkerEntry
    }
  >()
  private idleTimer: number | null = null

  constructor(createWorker: CreateWorkerFn, config: WorkerPoolConfig = workerPoolConfig) {
    this.createWorker = createWorker
    this.config = config
    if (config.warmupOnLoad) {
      this.warmup()
    }
  }

  enqueue(job: WorkerJob<TPayload>): Promise<unknown> {
    if (this.queue.length >= this.config.maxQueueDepth) {
      return Promise.reject(new Error('Queue depth exceeded'))
    }

    return new Promise((resolve, reject) => {
      this.queue.push(job)
      this.handlers.set(job.id, { resolve, reject })
        this.handlers.set(job.id, { resolve, reject, onProgress: job.onProgress })
      this.tick()
    })
  }

  cancel(jobId: JobToken) {
    const handler = this.handlers.get(jobId)
    if (handler && handler.worker) {
      handler.worker.worker.postMessage({ type: 'JOB_CANCEL', jobId })
      handler.reject(new Error('Canceled'))
      handler.worker.busy = false
      this.handlers.delete(jobId)
      this.tick()
    } else {
      // remove from queue if not yet dispatched
      this.queue = this.queue.filter((job) => job.id !== jobId)
    }
  }

  private tick() {
    if (this.queue.length === 0) {
      this.scheduleIdleCleanup()
      return
    }

    const available = this.ensureWorkers()
    if (available.length === 0) return

    for (const entry of available) {
      const job = this.queue.shift()
      if (!job) break
      entry.busy = true
      entry.jobId = job.id
      const handler = this.handlers.get(job.id)
      if (handler) {
        handler.worker = entry
      }
      entry.worker.postMessage(
        { type: 'JOB_START', jobId: job.id, payload: job.payload },
        extractTransfer(job.payload),
      )
    }
  }

  private ensureWorkers() {
    const available: WorkerEntry[] = this.workers.filter((w) => !w.busy)
    while (this.workers.length < this.config.poolSize) {
      const worker = this.spawnWorker()
      if (!worker) break
      this.workers.push(worker)
      available.push(worker)
    }
    return available
  }

  private spawnWorker(): WorkerEntry | null {
    try {
      const worker = this.createWorker()
      const entry: WorkerEntry = { worker, busy: false }
      worker.onmessage = (event: MessageEvent<WorkerMessageEnvelope>) => {
        const envelope = event.data
        if (!envelope || !envelope.jobId) return
        const handler = this.handlers.get(envelope.jobId)
        if (!handler) return

        if (envelope.type === 'JOB_PROGRESS') {
          if (typeof envelope.progress === 'number') handler.onProgress?.(envelope.progress)
          return
        }

        if (envelope.type === 'JOB_COMPLETE') {
          handler.resolve(envelope.payload ?? null)
        } else if (envelope.type === 'JOB_ERROR') {
          handler.reject(new Error(envelope.error || 'Worker error'))
        }

        entry.busy = false
        entry.jobId = undefined
        this.handlers.delete(envelope.jobId)
        this.tick()
      }
      worker.onerror = (err) => {
        if (entry.jobId) {
          const handler = this.handlers.get(entry.jobId)
          handler?.reject(err)
          this.handlers.delete(entry.jobId)
        }
        entry.busy = false
        entry.jobId = undefined
        this.tick()
      }
      return entry
    } catch (err) {
      console.error('Failed to spawn worker', err)
      return null
    }
  }

  private warmup() {
    for (let i = 0; i < this.config.poolSize; i += 1) {
      const entry = this.spawnWorker()
      if (entry) this.workers.push(entry)
    }
  }

  private scheduleIdleCleanup() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }
    this.idleTimer = window.setTimeout(() => {
      this.teardown()
    }, this.config.idleTimeout)
  }

  private teardown() {
    this.handlers.clear()
    this.queue = []
    this.workers.forEach((entry) => entry.worker.terminate())
    this.workers = []
  }
}

function extractTransfer(payload: unknown): Transferable[] {
  if (!payload || typeof payload !== 'object') return []
  const transfers: Transferable[] = []
  const maybe = payload as { 
    fileArrayBuffer?: ArrayBuffer
    pixels?: Uint8ClampedArray
    heatmap?: Float32Array
    // Note: grayscale is intentionally NOT transferred because FFT histogram
    // processing requires the same grayscale data for multiple components
    // (magnitude, phase, real, imag). Structured clone is used instead.
  }
  if (maybe.fileArrayBuffer) transfers.push(maybe.fileArrayBuffer)
  if (maybe.pixels?.buffer) transfers.push(maybe.pixels.buffer)
  if (maybe.heatmap?.buffer) transfers.push(maybe.heatmap.buffer)
  return transfers
}

const createImageWorker: CreateWorkerFn = () =>
  new Worker(new URL('./image-dsp.worker.ts', import.meta.url), { type: 'module' })

const createFftWorker: CreateWorkerFn = () =>
  new Worker(new URL('./fft-mixer.worker.ts', import.meta.url), { type: 'module' })

const createBeamWorker: CreateWorkerFn = () =>
  new Worker(new URL('./beam-sim.worker.ts', import.meta.url), { type: 'module' })

export const imageWorkerPool = new WorkerManager(createImageWorker, workerPoolConfig)
export const beamWorkerPool = new WorkerManager(createBeamWorker, {
  ...workerPoolConfig,
  warmupOnLoad: false,
})

export const fftWorkerPool = new WorkerManager(createFftWorker, workerPoolConfig)
