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
  mixerWeights: number[]
  presets: MixerPreset[]
  scenarios: SimulationState[]
  undoStack: unknown[]
  redoStack: unknown[]
  snapshots: string[]
  safeMode: SafeModeState
  telemetrySample: typeof TELEMETRY_SAMPLE
  toasts: Toast[]
  setSafeMode: (state: SafeModeState) => void
  pushSnapshot: (id: string) => void
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
  setWorkspaceDimensions: (dims: { width: number; height: number }) => void
  setNormalizedSize: (dims: { width: number; height: number }) => void
  setScenarios: (scenarios: SimulationState[]) => void
  setEntities?: (entities: ArrayEntity[]) => void
  pushToast: (toast: Toast) => void
  removeToast: (id: string) => void
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
  mixerWeights: [],
  presets: [],
  scenarios: [],
  undoStack: [],
  redoStack: [],
  snapshots: [],
  safeMode: { active: false },
  telemetrySample: TELEMETRY_SAMPLE,
  toasts: [],
  setSafeMode: (flag) => set({ safeMode: flag }),
  pushSnapshot: (id) => {
    const next = [...get().snapshots, id].slice(-SNAPSHOT_CAP)
    set({ snapshots: next })
  },
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
  setWorkspaceDimensions: (dims) => set({ workspaceDimensions: dims }),
  setNormalizedSize: (dims) => set({ normalizedSize: dims }),
  setScenarios: (scenarios) => set({ scenarios }),
  setEntities: () => {
    // placeholder for array entity mutations
  },
  pushToast: (toast) => set({ toasts: [...get().toasts, toast] }),
  removeToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))
