import type { WorkerPoolConfig, WidebandAggregation } from '@/types'

export const workerPoolConfig: WorkerPoolConfig = {
  poolSize: Math.max(1, (navigator.hardwareConcurrency || 4) - 1),
  warmupOnLoad: true,
  idleTimeout: 60_000,
  maxQueueDepth: 10,
}

export const widebandAggregation: WidebandAggregation = {
  method: 'coherent-sum',
  phaseAlignment: true,
}
