import { create } from 'zustand'
import { useGlobalStore } from './globalStore'

export interface TransientState {
  brightnessPad: { x: number; y: number }
  regionHandles: { start: number; end: number }
  mixerInFlight: number[]
  joystick: { x: number; y: number }
  syncTransientToGlobal: () => void
  setBrightnessPad: (payload: { x: number; y: number }) => void
  setRegionHandles: (payload: { start: number; end: number }) => void
  setMixerInFlight: (weights: number[]) => void
  setJoystick: (payload: { x: number; y: number }) => void
}

export const useTransientStore = create<TransientState>((set) => ({
  brightnessPad: { x: 0, y: 0 },
  regionHandles: { start: 0, end: 0 },
  mixerInFlight: [],
  joystick: { x: 0, y: 0 },
  syncTransientToGlobal: () => {
    // TODO: bridge transient values into global store slices
    const { mixerInFlight } = useTransientStore.getState()
    useGlobalStore.getState().setMixerWeights(mixerInFlight)
  },
  setBrightnessPad: (payload) => set({ brightnessPad: payload }),
  setRegionHandles: (payload) => set({ regionHandles: payload }),
  setMixerInFlight: (weights) => set({ mixerInFlight: weights }),
  setJoystick: (payload) => set({ joystick: payload }),
}))
