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

export type BeamRenderMode = 'interference' | 'beam-slice' | 'array-geometry'
export type WidebandMode = 'aggregated' | 'per-carrier'

export interface SimulationState {
  scenarioId: string
  renderMode: BeamRenderMode
  widebandMode: WidebandMode
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

/**
 * Individual mixer channel with 2D weight control (Magnitude/Phase or Real/Imag)
 */
export interface MixerChannel {
  id: ImageSlotId
  /** Weight for Magnitude (or Real part in Real/Imag mode) */
  weight1: number
  /** Weight for Phase (or Imaginary part in Real/Imag mode) */
  weight2: number
  /** When locked, weight1 and weight2 move together */
  locked: boolean
  /** Temporarily treats weights as zero without losing values */
  muted: boolean
  /** When active, this channel is 100% and others become 0% */
  solo: boolean
}

/** Mode selector for mixer interpretation */
export type MixerMode = 'mag-phase' | 'real-imag'

/**
 * Complete mixer configuration with 2D weight matrix
 */
export interface MixerWeights {
  /** Legacy: simple array of weights (deprecated, for backward compat) */
  values: number[]
  /** Legacy locked flag (deprecated) */
  locked?: boolean
  /** New 2D channel configuration */
  channels: MixerChannel[]
  /** Current mixer mode */
  mode: MixerMode
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

/** Region edit target for per-pixel content mixing */
export type RegionEditTarget = 'inside' | 'outside'

/** Weight configuration for a single channel in a region */
export interface RegionChannelWeight {
  id: ImageSlotId
  w1: number  // Magnitude or Real weight (0-1)
  w2: number  // Phase or Imaginary weight (0-1)
}

export interface MixerJobPayload {
  images: Array<{ id: ImageSlotId; width: number; height: number; pixels: Uint8ClampedArray }>
  weights: MixerWeights
  /** Inner region channel weights for per-pixel mixing */
  weightsInside: RegionChannelWeight[]
  /** Outer region channel weights for per-pixel mixing */
  weightsOutside: RegionChannelWeight[]
  regionMask: RegionMask
  brightnessConfig: BrightnessConfig
  targetViewport: OutputViewportId
  fftMode?: 'js' | 'wasm'
}

/**
 * Effective weights computed from MixerWeights considering mute/solo states
 */
export interface EffectiveMixerWeights {
  channels: Array<{
    id: ImageSlotId
    weight1: number // Magnitude or Real weight
    weight2: number // Phase or Imaginary weight
  }>
  mode: MixerMode
}

export interface BeamJobPayload {
  arrays: ArrayEntity[]
  steering: { theta: number; phi: number }
  renderMode: BeamRenderMode
  widebandMode: WidebandMode
  resolution: number
  bounds?: { xMin: number; xMax: number; yMin: number; yMax: number }
}

export interface BeamResult {
  heatmap?: Float32Array
  beamSlice?: Float32Array
  geometry?: ArrayEntity[]
  width: number
  height: number
}
