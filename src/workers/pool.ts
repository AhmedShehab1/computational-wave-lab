import { workerPoolConfig } from '@/config/runtime'
import type { WorkerPoolConfig } from '@/types'
import type { JobToken } from './types'

export type WorkerJobType = 'image-dsp' | 'beam-sim'

interface WorkerJob<TPayload = unknown> {
  id: JobToken
  type: WorkerJobType
  payload: TPayload
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}

export class WorkerManager {
  private config: WorkerPoolConfig
  private queue: WorkerJob[] = []
  private busy = 0
  private idleTimer: number | null = null

  constructor(config: WorkerPoolConfig = workerPoolConfig) {
    this.config = config
    if (config.warmupOnLoad) {
      this.warmup()
    }
  }

  enqueue<TPayload>(job: Omit<WorkerJob<TPayload>, 'resolve' | 'reject'>): Promise<unknown> {
    if (this.queue.length >= this.config.maxQueueDepth) {
      return Promise.reject(new Error('Queue depth exceeded'))
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ ...job, resolve, reject })
      this.tick()
    })
  }

  private tick() {
    if (this.queue.length === 0) {
      this.scheduleIdleCleanup()
      return
    }

    const capacity = this.config.poolSize - this.busy
    if (capacity <= 0) return

    for (let i = 0; i < capacity; i += 1) {
      const job = this.queue.shift()
      if (!job) break
      this.busy += 1
      // TODO: bind to real worker; simulate for now
      setTimeout(() => {
        job.resolve({ jobId: job.id, status: 'complete' })
        this.busy -= 1
        this.tick()
      }, 10)
    }
  }

  private warmup() {
    // TODO: spin up real worker instances per job type
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
    this.queue = []
    this.busy = 0
  }
}

export const imageWorkerPool = new WorkerManager(workerPoolConfig)
export const beamWorkerPool = new WorkerManager(workerPoolConfig)
