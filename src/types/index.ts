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

export interface MixerPreset {
  version: '1.0.0'
  timestamp: number
  weights: MixerWeights['values']
  regionMask: RegionMask
  brightnessConfig: BrightnessConfig
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

export type FileSlot = 'A' | 'B' | 'C' | 'D'
export type ImageSlotId = FileSlot

export interface FileMeta {
  id: FileSlot
  name: string
  size: number
  type: string
  lastModified?: number
}

export interface Toast {
  id: string
  type: 'info' | 'error' | 'success' | 'warning'
  message: string
  duration?: number
}

export interface SafeModeState {
  active: boolean
  reason?: string
}

export interface ImageDataPayload {
  width: number
  height: number
  pixels: Uint8ClampedArray
}

export interface MixerWeights {
  values: number[]
  locked?: boolean
}

export type RegionShape = 'circle' | 'rect'
export type RegionMode = 'include' | 'exclude'

export interface RegionMask {
  shape: RegionShape
  mode: RegionMode
  radius?: number // normalized 0-1
  width?: number // normalized 0-1
  height?: number // normalized 0-1
}

export interface BrightnessConfig {
  target: 'spatial' | 'ft'
  value: number
  contrast: number
}

export type OutputViewportId = 1 | 2

export interface MixerJobPayload {
  images: Array<{ id: ImageSlotId; width: number; height: number; pixels: Uint8ClampedArray }>
  weights: MixerWeights
  regionMask: RegionMask
  brightnessConfig: BrightnessConfig
  targetViewport: OutputViewportId
  fftMode?: 'js' | 'wasm'
}
