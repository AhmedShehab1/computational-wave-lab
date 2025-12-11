import { create } from 'zustand'
import { SNAPSHOT_CAP, TELEMETRY_SAMPLE } from '@/config/constants'
import type { ArrayEntity, FileMeta, MixerPreset, SimulationState } from '@/types'

export interface GlobalState {
  files: FileMeta[]
  workspaceDimensions: { width: number; height: number }
  mixerWeights: number[]
  presets: MixerPreset[]
  scenarios: SimulationState[]
  undoStack: unknown[]
  redoStack: unknown[]
  snapshots: string[]
  safeMode: boolean
  telemetrySample: typeof TELEMETRY_SAMPLE
  setSafeMode: (flag: boolean) => void
  pushSnapshot: (id: string) => void
  setMixerWeights: (weights: number[]) => void
  setFiles: (files: FileMeta[]) => void
  setWorkspaceDimensions: (dims: { width: number; height: number }) => void
  setScenarios: (scenarios: SimulationState[]) => void
  setEntities?: (entities: ArrayEntity[]) => void
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
  safeMode: false,
  telemetrySample: TELEMETRY_SAMPLE,
  setSafeMode: (flag) => set({ safeMode: flag }),
  pushSnapshot: (id) => {
    const next = [...get().snapshots, id].slice(-SNAPSHOT_CAP)
    set({ snapshots: next })
  },
  setMixerWeights: (weights) => set({ mixerWeights: weights }),
  setFiles: (files) => set({ files }),
  setWorkspaceDimensions: (dims) => set({ workspaceDimensions: dims }),
  setScenarios: (scenarios) => set({ scenarios }),
  setEntities: () => {
    // placeholder for array entity mutations
  },
}))
