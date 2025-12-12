import { create } from 'zustand'
import { SNAPSHOT_CAP, TELEMETRY_SAMPLE } from '@/config/constants'
import type {
  ArrayEntity,
  FileMeta,
  FileSlot,
  ImageDataPayload,
  ImageSlotId,
  MixerWeights,
  RegionMask,
  BrightnessConfig,
  OutputViewportId,
  MixerPreset,
  SafeModeState,
  SimulationState,
  BeamResult,
  BeamRenderMode,
  WidebandMode,
  Toast,
} from '@/types'

export interface GlobalState {
  files: FileMeta[]
  images: Record<ImageSlotId, ImageDataPayload | null>
  workspaceDimensions: { width: number; height: number }
  normalizedSize?: { width: number; height: number }
  mixerConfig: MixerWeights
  regionMask: RegionMask
  brightnessConfig: BrightnessConfig
  outputImages: Record<OutputViewportId, ImageDataPayload | null>
  outputStatus: Record<OutputViewportId, 'idle' | 'mixing' | 'error'>
  mixerProgress: Record<OutputViewportId, number | null>
  compareSelection: Record<OutputViewportId, string | null>
  mixerWeights: number[]
  presets: MixerPreset[]
  scenarios: SimulationState[]
  snapshots: {
    id: string
    viewport: OutputViewportId
    image: ImageDataPayload
    createdAt: number
  }[]
  beamConfig: {
    arrays: ArrayEntity[]
    steering: { theta: number; phi: number }
    renderMode: BeamRenderMode
    widebandMode: WidebandMode
    resolution: number
    bounds?: { xMin: number; xMax: number; yMin: number; yMax: number }
  }
  beamResult: BeamResult | null
  beamStatus: 'idle' | 'running' | 'error'
  undoStack: unknown[]
  redoStack: unknown[]
  safeMode: SafeModeState
  telemetrySample: typeof TELEMETRY_SAMPLE
  toasts: Toast[]
  setSafeMode: (state: SafeModeState) => void
  addSnapshot: (viewport: OutputViewportId, image: ImageDataPayload) => void
  removeSnapshot: (id: string) => void
  clearSnapshots: () => void
  setMixerWeights: (weights: number[]) => void
  setMixerConfig: (config: MixerWeights) => void
  setRegionMask: (mask: RegionMask) => void
  setBrightnessConfig: (config: BrightnessConfig) => void
  setFiles: (files: FileMeta[]) => void
  setFileMeta: (slot: FileSlot, meta: FileMeta) => void
  setImageData: (slot: ImageSlotId, data: ImageDataPayload | null) => void
  clearImages: () => void
  setOutputImage: (id: OutputViewportId, data: ImageDataPayload | null) => void
  setOutputStatus: (id: OutputViewportId, status: 'idle' | 'mixing' | 'error') => void
  setMixerProgress: (id: OutputViewportId, progress: number | null) => void
  setWorkspaceDimensions: (dims: { width: number; height: number }) => void
  setNormalizedSize: (dims: { width: number; height: number }) => void
  setScenarios: (scenarios: SimulationState[]) => void
  setEntities?: (entities: ArrayEntity[]) => void
  pushToast: (toast: Toast) => void
  removeToast: (id: string) => void
  setCompareSelection: (target: OutputViewportId, snapshotId: string | null) => void
  setBeamConfig: (
    config: Partial<{
      arrays: ArrayEntity[]
      steering: { theta: number; phi: number }
      renderMode: BeamRenderMode
      widebandMode: WidebandMode
      resolution: number
      bounds?: { xMin: number; xMax: number; yMin: number; yMax: number }
    }>
  ) => void
  setBeamResult: (result: BeamResult | null) => void
  setBeamStatus: (status: 'idle' | 'running' | 'error') => void
}

export const useGlobalStore = create<GlobalState>((set, get) => ({
  files: [],
  images: { A: null, B: null, C: null, D: null },
  workspaceDimensions: { width: 0, height: 0 },
  normalizedSize: undefined,
  mixerConfig: { values: [] },
  regionMask: { shape: 'circle', mode: 'include', radius: 1 },
  brightnessConfig: { target: 'spatial', value: 0, contrast: 1 },
  outputImages: { 1: null, 2: null },
  outputStatus: { 1: 'idle', 2: 'idle' },
  mixerProgress: { 1: null, 2: null },
  compareSelection: { 1: null, 2: null },
  mixerWeights: [],
  presets: [],
  scenarios: [],
  snapshots: [],
  beamConfig: {
    arrays: [],
    steering: { theta: 0, phi: 0 },
    renderMode: 'interference',
    widebandMode: 'aggregated',
    resolution: 128,
  },
  beamResult: null,
  beamStatus: 'idle',
  undoStack: [],
  redoStack: [],
  safeMode: { active: false },
  telemetrySample: TELEMETRY_SAMPLE,
  toasts: [],
  setSafeMode: (flag) => set({ safeMode: flag }),
  addSnapshot: (viewport, image) => {
    const entry = { id: crypto.randomUUID(), viewport, image, createdAt: Date.now() }
    const next = [...get().snapshots, entry].slice(-SNAPSHOT_CAP)
    set({ snapshots: next })
  },
  removeSnapshot: (id) => {
    set({ snapshots: get().snapshots.filter((s) => s.id !== id) })
  },
  clearSnapshots: () => set({ snapshots: [] }),
  setMixerWeights: (weights) => set({ mixerWeights: weights }),
  setMixerConfig: (config) => set({ mixerConfig: config }),
  setRegionMask: (mask) => set({ regionMask: mask }),
  setBrightnessConfig: (config) => set({ brightnessConfig: config }),
  setFiles: (files) => set({ files }),
  setFileMeta: (slot, meta) => {
    const next = get().files.filter((f) => f.id !== slot)
    set({ files: [...next, meta] })
  },
  setImageData: (slot, data) => {
    set({ images: { ...get().images, [slot]: data } })
  },
  clearImages: () => set({ images: { A: null, B: null, C: null, D: null } }),
  setOutputImage: (id, data) => set({ outputImages: { ...get().outputImages, [id]: data } }),
  setOutputStatus: (id, status) =>
    set({ outputStatus: { ...get().outputStatus, [id]: status } }),
  setMixerProgress: (id, progress) =>
    set({ mixerProgress: { ...get().mixerProgress, [id]: progress } }),
  setWorkspaceDimensions: (dims) => set({ workspaceDimensions: dims }),
  setNormalizedSize: (dims) => set({ normalizedSize: dims }),
  setScenarios: (scenarios) => set({ scenarios }),
  setEntities: () => {
    // placeholder for array entity mutations
  },
  setBeamConfig: (partial) => set({ beamConfig: { ...get().beamConfig, ...partial } }),
  setBeamResult: (result) => set({ beamResult: result }),
  setBeamStatus: (status) => set({ beamStatus: status }),
  pushToast: (toast) => set({ toasts: [...get().toasts, toast] }),
  removeToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setCompareSelection: (target, snapshotId) =>
    set({ compareSelection: { ...get().compareSelection, [target]: snapshotId } }),
}))
