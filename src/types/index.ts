export interface WorkerPoolConfig {
  poolSize: number
  warmupOnLoad: boolean
  idleTimeout: number
  maxQueueDepth: number
}

export type WorkerStatus = 'idle' | 'busy' | 'error'

export interface WidebandAggregation {
  method: 'coherent-sum'
  phaseAlignment: boolean
}

export type WorkerTelemetryEventType = 'WorkerError' | 'Timeout' | 'OOM_Warning'

export interface WorkerErrorEvent {
  workerId: string
  jobId?: string
  type: WorkerTelemetryEventType
  message: string
  timestamp: number
}

export interface MixerJobPayload {
  weights: number[]
  regionMask: number[][]
  brightnessConfig: {
    target: 'spatial' | 'ft'
    value: number
    contrast: number
  }
}

export interface MixerPreset {
  version: '1.0.0'
  timestamp: number
  weights: MixerJobPayload['weights']
  regionMask: MixerJobPayload['regionMask']
  brightnessConfig: MixerJobPayload['brightnessConfig']
}

export interface SimulationState {
  scenarioId: string
  renderMode: 'interference' | 'beam-slice' | 'array-geometry'
  widebandMode: 'aggregated' | 'per-carrier'
}

export interface ArrayEntity {
  id: string
  config: {
    frequencies: number[]
    bandwidth: number
  }
  position?: {
    x: number
    y: number
    z?: number
  }
  role?: 'tx' | 'rx'
  phaseTaper?: number
}

export interface FileMeta {
  id: string
  name: string
  size: number
  mimeType?: string
  createdAt?: number
}
