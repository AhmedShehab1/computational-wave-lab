import { create } from 'zustand'
import { SNAPSHOT_CAP, TELEMETRY_SAMPLE } from '@/config/constants'
import type {
  ArrayEntity,
  FileMeta,
  FileSlot,
  MixerPreset,
  SafeModeState,
  SimulationState,
  Toast,
} from '@/types'

export interface GlobalState {
  files: FileMeta[]
  workspaceDimensions: { width: number; height: number }
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
  setFiles: (files: FileMeta[]) => void
  setFileMeta: (slot: FileSlot, meta: FileMeta) => void
  setWorkspaceDimensions: (dims: { width: number; height: number }) => void
  setNormalizedSize: (dims: { width: number; height: number }) => void
  setScenarios: (scenarios: SimulationState[]) => void
  setEntities?: (entities: ArrayEntity[]) => void
  pushToast: (toast: Toast) => void
  removeToast: (id: string) => void
}

export const useGlobalStore = create<GlobalState>((set, get) => ({
  files: [],
  workspaceDimensions: { width: 0, height: 0 },
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
  setFiles: (files) => set({ files }),
  setFileMeta: (slot, meta) => {
    const next = get().files.filter((f) => f.id !== slot)
    set({ files: [...next, meta] })
  },
  setWorkspaceDimensions: (dims) => set({ workspaceDimensions: dims }),
  setNormalizedSize: (dims) => set({ workspaceDimensions: dims }),
  setScenarios: (scenarios) => set({ scenarios }),
  setEntities: () => {
    // placeholder for array entity mutations
  },
  pushToast: (toast) => set({ toasts: [...get().toasts, toast] }),
  removeToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))
