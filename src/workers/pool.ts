import { workerPoolConfig } from '@/config/runtime'
import type { WorkerPoolConfig } from '@/types'
import type { JobToken } from './types'

export type WorkerJobType = 'image-dsp' | 'beam-sim'

interface WorkerJob<TPayload = unknown> {
  id: JobToken
  type: WorkerJobType
  payload: TPayload
}

export class WorkerManager {
  private config: WorkerPoolConfig
  private queue: WorkerJob[] = []
  private workers: Worker[] = []
  private idleTimer: number | null = null

  constructor(config: WorkerPoolConfig = workerPoolConfig) {
    this.config = config
    if (config.warmupOnLoad) {
      this.warmup()
    }
  }

  enqueue<TPayload>(job: WorkerJob<TPayload>): boolean {
    if (this.queue.length >= this.config.maxQueueDepth) {
      return false
    }
    this.queue.push(job)
    // TODO: dispatch to an available worker and handle lifecycle
    this.scheduleIdleCleanup()
    return true
  }

  private warmup() {
    // TODO: spin up worker instances for both job types
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
    this.workers.forEach((w) => w.terminate())
    this.workers = []
    this.queue = []
  }
}
