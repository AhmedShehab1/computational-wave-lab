import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PhasedArrayConfig, ArrayGeometry } from '@/classes/PhasedArray'

// Re-export PhasedArrayConfig for convenience
export type { PhasedArrayConfig, ArrayGeometry } from '@/classes/PhasedArray'

// ============================================================================
// PHYSICAL CONSTANTS & TYPES
// ============================================================================

export type BeamAlgorithm = 'capon' | 'music' | 'das' | 'mvdr'
export type WeightType = 'adaptive' | 'fixed'
export type Medium = 'air' | 'water' | 'tissue'

// Medium-specific speed of sound (m/s)
export const SPEED_OF_SOUND: Record<Medium, number> = {
  air: 343,
  water: 1481,
  tissue: 1540,
}

// ============================================================================
// BEAMFORMING STATE INTERFACE
// ============================================================================

export interface BeamformingState {
  // ─────────────────────────────────────────────────────────────────────────
  // Multi-Array Support (OOP Refactoring)
  // ─────────────────────────────────────────────────────────────────────────
  units: PhasedArrayConfig[]     // Array of phased array configurations
  activeUnitId: string           // Currently selected unit ID

  // ─────────────────────────────────────────────────────────────────────────
  // Global Physical Constants
  // ─────────────────────────────────────────────────────────────────────────
  medium: Medium                 // Air, Water, or Tissue
  speedOfSound: number           // m/s (depends on medium)

  // ─────────────────────────────────────────────────────────────────────────
  // Algorithm Selection
  // ─────────────────────────────────────────────────────────────────────────
  algorithm: BeamAlgorithm       // Capon, MUSIC, DAS, MVDR
  weightType: WeightType         // Adaptive or Fixed weights

  // ─────────────────────────────────────────────────────────────────────────
  // Real-Time Controls
  // ─────────────────────────────────────────────────────────────────────────
  isPlaying: boolean             // Animation/scanning state
  scanSpeed: number              // Scan rate in Hz (1-60)
  scanRange: [number, number]    // Scan angle range [min, max] in degrees
  interferenceCancel: boolean    // Enable interference cancellation

  // ─────────────────────────────────────────────────────────────────────────
  // Display Settings
  // ─────────────────────────────────────────────────────────────────────────
  showGrid: boolean              // Show polar grid
  showLabels: boolean            // Show angle labels
  colormap: 'viridis' | 'plasma' | 'inferno' | 'magma' | 'thermal' | 'turbo' | 'jet'
  dynamicRange: number           // dB range for display (20-80)

  // ─────────────────────────────────────────────────────────────────────────
  // Legacy Compatibility (Computed from active unit)
  // ─────────────────────────────────────────────────────────────────────────
  frequency: number              // Hz - mirrors activeUnit.frequency
  wavelength: number             // λ = c / f (computed)
  sensorCount: number            // mirrors activeUnit.elements
  sensorSpacing: number          // mirrors activeUnit.pitch
  spacingLambdaFraction: number  // d/λ ratio (computed)
  geometry: ArrayGeometry        // mirrors activeUnit.geometry
  steeringAngle: number          // mirrors activeUnit.steeringAngle
  focusDistance: number          // Focal point in meters
  phaseOffsets: number[]         // Per-element phase offsets (computed)
  weights: number[]              // Current weight vector
}

// ============================================================================
// ACTIONS INTERFACE
// ============================================================================

export interface BeamformingActions {
  // ─────────────────────────────────────────────────────────────────────────
  // Unit Management (Multi-Array)
  // ─────────────────────────────────────────────────────────────────────────
  addUnit: (config?: Partial<PhasedArrayConfig>) => string  // Returns new unit ID
  removeUnit: (id: string) => void
  setActiveUnit: (id: string) => void
  updateUnit: (id: string, updates: Partial<PhasedArrayConfig>) => void
  getActiveUnit: () => PhasedArrayConfig | undefined
  
  // ─────────────────────────────────────────────────────────────────────────
  // Scenario Loading
  // ─────────────────────────────────────────────────────────────────────────
  loadScenarioConfig: (units: PhasedArrayConfig[], medium: Medium) => void
  
  // ─────────────────────────────────────────────────────────────────────────
  // Global Settings
  // ─────────────────────────────────────────────────────────────────────────
  setMedium: (medium: Medium) => void
  
  // ─────────────────────────────────────────────────────────────────────────
  // Active Unit Shortcuts (Legacy Compatibility)
  // ─────────────────────────────────────────────────────────────────────────
  setFrequency: (freq: number) => void
  setSensorCount: (count: number) => void
  setSpacingLambdaFraction: (fraction: number) => void
  setGeometry: (geometry: ArrayGeometry) => void
  setSteeringAngle: (angle: number) => void
  setFocusDistance: (distance: number) => void
  setCurvatureRadius: (radius: number) => void
  
  // Algorithm
  setAlgorithm: (algorithm: BeamAlgorithm) => void
  setWeightType: (weightType: WeightType) => void
  
  // Controls
  setIsPlaying: (playing: boolean) => void
  togglePlayPause: () => void
  setScanSpeed: (speed: number) => void
  setScanRange: (range: [number, number]) => void
  setInterferenceCancel: (enabled: boolean) => void
  triggerScan: () => void
  resetSimulation: () => void
  
  // Display
  setShowGrid: (show: boolean) => void
  setShowLabels: (show: boolean) => void
  setColormap: (colormap: BeamformingState['colormap']) => void
  setDynamicRange: (range: number) => void
  
  // Computed helpers
  computePhaseOffsets: () => number[]
  computeWavelength: () => number
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_FREQUENCY = 1000 // 1 kHz
const DEFAULT_MEDIUM: Medium = 'air'
const DEFAULT_SENSOR_COUNT = 8
const DEFAULT_SPACING_FRACTION = 0.5 // λ/2

const computeWavelength = (frequency: number, speedOfSound: number): number => {
  return speedOfSound / frequency
}

const computeSpacing = (wavelength: number, fraction: number): number => {
  return wavelength * fraction
}

const computePhaseOffsetsForSteering = (
  sensorCount: number,
  spacing: number,
  wavelength: number,
  steeringAngle: number
): number[] => {
  const phases: number[] = []
  const k = (2 * Math.PI) / wavelength // Wave number
  const thetaRad = (steeringAngle * Math.PI) / 180
  
  for (let n = 0; n < sensorCount; n++) {
    // Phase shift for element n to steer beam to theta
    // φ_n = -k * d * n * sin(θ)
    const phase = -k * spacing * n * Math.sin(thetaRad)
    phases.push(phase)
  }
  
  return phases
}

// Generate unique ID for units
const generateUnitId = (): string => `unit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

// Create default unit configuration
const createDefaultUnitConfig = (
  id: string,
  speedOfSound: number,
  name?: string
): PhasedArrayConfig => {
  const wavelength = computeWavelength(DEFAULT_FREQUENCY, speedOfSound)
  const pitch = computeSpacing(wavelength, DEFAULT_SPACING_FRACTION)
  
  return {
    id,
    name: name || 'Array 1',
    position: { x: 0, y: 0 },
    elements: DEFAULT_SENSOR_COUNT,
    pitch,
    geometry: 'linear',
    curvatureRadius: 0,
    frequency: DEFAULT_FREQUENCY,
    steeringAngle: 0,
    amplitudes: new Array(DEFAULT_SENSOR_COUNT).fill(1),
    enabled: true,
  }
}

// ============================================================================
// STORE CREATION
// ============================================================================

export const useBeamStore = create<BeamformingState & BeamformingActions>()(
  persist(
    (set, get) => {
      const speedOfSound = SPEED_OF_SOUND[DEFAULT_MEDIUM]
      const initialUnitId = generateUnitId()
      const initialUnit = createDefaultUnitConfig(initialUnitId, speedOfSound)
      const initialWavelength = computeWavelength(DEFAULT_FREQUENCY, speedOfSound)
      const initialSpacing = computeSpacing(initialWavelength, DEFAULT_SPACING_FRACTION)
      
      return {
        // ─────────────────────────────────────────────────────────────────────
        // Initial State
        // ─────────────────────────────────────────────────────────────────────
        
        // Multi-array support
        units: [initialUnit],
        activeUnitId: initialUnitId,
        
        // Global settings
        medium: DEFAULT_MEDIUM,
        speedOfSound,
        
        // Legacy compatibility (mirrors active unit)
        frequency: DEFAULT_FREQUENCY,
        wavelength: initialWavelength,
        sensorCount: DEFAULT_SENSOR_COUNT,
        sensorSpacing: initialSpacing,
        spacingLambdaFraction: DEFAULT_SPACING_FRACTION,
        geometry: 'linear',
        steeringAngle: 0,
        focusDistance: Infinity,
        phaseOffsets: new Array(DEFAULT_SENSOR_COUNT).fill(0),
        weights: new Array(DEFAULT_SENSOR_COUNT).fill(1),
        
        // Algorithm
        algorithm: 'capon',
        weightType: 'adaptive',
        
        // Controls
        isPlaying: false,
        scanSpeed: 10,
        scanRange: [-90, 90],
        interferenceCancel: true,
        
        // Display
        showGrid: true,
        showLabels: true,
        colormap: 'viridis',
        dynamicRange: 40,
        
        // ─────────────────────────────────────────────────────────────────────
        // Unit Management Actions
        // ─────────────────────────────────────────────────────────────────────
        
        addUnit: (config?: Partial<PhasedArrayConfig>) => {
          const state = get()
          const newId = generateUnitId()
          const unitNumber = state.units.length + 1
          const newUnit: PhasedArrayConfig = {
            ...createDefaultUnitConfig(newId, state.speedOfSound, `Array ${unitNumber}`),
            ...config,
            id: newId, // Ensure ID is not overwritten
          }
          
          set({ units: [...state.units, newUnit] })
          return newId
        },
        
        removeUnit: (id: string) => {
          const state = get()
          if (state.units.length <= 1) return // Keep at least one unit
          
          const newUnits = state.units.filter((u) => u.id !== id)
          const newActiveId = state.activeUnitId === id 
            ? newUnits[0].id 
            : state.activeUnitId
          
          // Sync legacy state with new active unit
          const activeUnit = newUnits.find((u) => u.id === newActiveId)
          if (activeUnit) {
            const wavelength = computeWavelength(activeUnit.frequency, state.speedOfSound)
            set({
              units: newUnits,
              activeUnitId: newActiveId,
              frequency: activeUnit.frequency,
              wavelength,
              sensorCount: activeUnit.elements,
              sensorSpacing: activeUnit.pitch,
              spacingLambdaFraction: activeUnit.pitch / wavelength,
              geometry: activeUnit.geometry,
              steeringAngle: activeUnit.steeringAngle,
              phaseOffsets: computePhaseOffsetsForSteering(
                activeUnit.elements,
                activeUnit.pitch,
                wavelength,
                activeUnit.steeringAngle
              ),
              weights: activeUnit.amplitudes || new Array(activeUnit.elements).fill(1),
            })
          }
        },
        
        setActiveUnit: (id: string) => {
          const state = get()
          const unit = state.units.find((u) => u.id === id)
          if (!unit) return
          
          const wavelength = computeWavelength(unit.frequency, state.speedOfSound)
          
          set({
            activeUnitId: id,
            frequency: unit.frequency,
            wavelength,
            sensorCount: unit.elements,
            sensorSpacing: unit.pitch,
            spacingLambdaFraction: unit.pitch / wavelength,
            geometry: unit.geometry,
            steeringAngle: unit.steeringAngle,
            phaseOffsets: computePhaseOffsetsForSteering(
              unit.elements,
              unit.pitch,
              wavelength,
              unit.steeringAngle
            ),
            weights: unit.amplitudes || new Array(unit.elements).fill(1),
          })
        },
        
        updateUnit: (id: string, updates: Partial<PhasedArrayConfig>) => {
          const state = get()
          const newUnits = state.units.map((u) =>
            u.id === id ? { ...u, ...updates, id: u.id } : u
          )
          
          set({ units: newUnits })
          
          // If updating active unit, sync legacy state
          if (id === state.activeUnitId) {
            const updatedUnit = newUnits.find((u) => u.id === id)
            if (updatedUnit) {
              const wavelength = computeWavelength(updatedUnit.frequency, state.speedOfSound)
              set({
                frequency: updatedUnit.frequency,
                wavelength,
                sensorCount: updatedUnit.elements,
                sensorSpacing: updatedUnit.pitch,
                spacingLambdaFraction: updatedUnit.pitch / wavelength,
                geometry: updatedUnit.geometry,
                steeringAngle: updatedUnit.steeringAngle,
                phaseOffsets: computePhaseOffsetsForSteering(
                  updatedUnit.elements,
                  updatedUnit.pitch,
                  wavelength,
                  updatedUnit.steeringAngle
                ),
                weights: updatedUnit.amplitudes || new Array(updatedUnit.elements).fill(1),
              })
            }
          }
        },
        
        getActiveUnit: () => {
          const state = get()
          return state.units.find((u) => u.id === state.activeUnitId)
        },
        
        // ─────────────────────────────────────────────────────────────────────
        // Scenario Loading
        // ─────────────────────────────────────────────────────────────────────
        
        loadScenarioConfig: (units: PhasedArrayConfig[], medium: Medium) => {
          if (units.length === 0) return
          
          const speedOfSound = SPEED_OF_SOUND[medium]
          const firstUnit = units[0]
          const wavelength = computeWavelength(firstUnit.frequency, speedOfSound)
          
          set({
            units,
            activeUnitId: firstUnit.id,
            medium,
            speedOfSound,
            // Sync legacy state with first unit
            frequency: firstUnit.frequency,
            wavelength,
            sensorCount: firstUnit.elements,
            sensorSpacing: firstUnit.pitch,
            spacingLambdaFraction: firstUnit.pitch / wavelength,
            geometry: firstUnit.geometry,
            steeringAngle: firstUnit.steeringAngle,
            phaseOffsets: computePhaseOffsetsForSteering(
              firstUnit.elements,
              firstUnit.pitch,
              wavelength,
              firstUnit.steeringAngle
            ),
            weights: firstUnit.amplitudes || new Array(firstUnit.elements).fill(1),
          })
        },
        
        // ─────────────────────────────────────────────────────────────────────
        // Global Settings
        // ─────────────────────────────────────────────────────────────────────
        
        setMedium: (medium) => {
          const state = get()
          const speedOfSound = SPEED_OF_SOUND[medium]
          const wavelength = computeWavelength(state.frequency, speedOfSound)
          const spacing = computeSpacing(wavelength, state.spacingLambdaFraction)
          const phaseOffsets = computePhaseOffsetsForSteering(
            state.sensorCount, spacing, wavelength, state.steeringAngle
          )
          
          // Update all units' pitch to maintain λ/2 spacing
          const newUnits = state.units.map((unit) => {
            const unitWavelength = computeWavelength(unit.frequency, speedOfSound)
            const unitPitch = computeSpacing(unitWavelength, state.spacingLambdaFraction)
            return { ...unit, pitch: unitPitch }
          })
          
          set({ 
            medium, 
            speedOfSound, 
            wavelength, 
            sensorSpacing: spacing, 
            phaseOffsets,
            units: newUnits,
          })
        },
        
        // ─────────────────────────────────────────────────────────────────────
        // Legacy Compatibility Actions (Update active unit + legacy state)
        // ─────────────────────────────────────────────────────────────────────
        
        setFrequency: (freq) => {
          const state = get()
          const wavelength = computeWavelength(freq, state.speedOfSound)
          const spacing = computeSpacing(wavelength, state.spacingLambdaFraction)
          const phaseOffsets = computePhaseOffsetsForSteering(
            state.sensorCount, spacing, wavelength, state.steeringAngle
          )
          
          // Update active unit
          const newUnits = state.units.map((u) =>
            u.id === state.activeUnitId 
              ? { ...u, frequency: freq, pitch: spacing }
              : u
          )
          
          set({ 
            frequency: freq, 
            wavelength, 
            sensorSpacing: spacing, 
            phaseOffsets,
            units: newUnits,
          })
        },
        
        setSensorCount: (count) => {
          const state = get()
          const phaseOffsets = computePhaseOffsetsForSteering(
            count, state.sensorSpacing, state.wavelength, state.steeringAngle
          )
          const weights = new Array(count).fill(1)
          
          // Update active unit
          const newUnits = state.units.map((u) =>
            u.id === state.activeUnitId 
              ? { ...u, elements: count, amplitudes: weights }
              : u
          )
          
          set({ sensorCount: count, phaseOffsets, weights, units: newUnits })
        },
        
        setSpacingLambdaFraction: (fraction) => {
          const state = get()
          const spacing = computeSpacing(state.wavelength, fraction)
          const phaseOffsets = computePhaseOffsetsForSteering(
            state.sensorCount, spacing, state.wavelength, state.steeringAngle
          )
          
          // Update active unit
          const newUnits = state.units.map((u) =>
            u.id === state.activeUnitId 
              ? { ...u, pitch: spacing }
              : u
          )
          
          set({ 
            spacingLambdaFraction: fraction, 
            sensorSpacing: spacing, 
            phaseOffsets,
            units: newUnits,
          })
        },
        
        setGeometry: (geometry) => {
          const state = get()
          
          // Update active unit
          const newUnits = state.units.map((u) =>
            u.id === state.activeUnitId 
              ? { ...u, geometry }
              : u
          )
          
          set({ geometry, units: newUnits })
        },
        
        setSteeringAngle: (angle) => {
          const state = get()
          const phaseOffsets = computePhaseOffsetsForSteering(
            state.sensorCount, state.sensorSpacing, state.wavelength, angle
          )
          
          // Update active unit
          const newUnits = state.units.map((u) =>
            u.id === state.activeUnitId 
              ? { ...u, steeringAngle: angle }
              : u
          )
          
          set({ steeringAngle: angle, phaseOffsets, units: newUnits })
        },
        
        setFocusDistance: (distance) => set({ focusDistance: distance }),
        
        setCurvatureRadius: (radius) => {
          const state = get()
          
          // Update active unit
          const newUnits = state.units.map((u) =>
            u.id === state.activeUnitId 
              ? { ...u, curvatureRadius: radius }
              : u
          )
          
          set({ units: newUnits })
        },
        
        // ─────────────────────────────────────────────────────────────────────
        // Algorithm & Controls
        // ─────────────────────────────────────────────────────────────────────
        
        setAlgorithm: (algorithm) => set({ algorithm }),
        setWeightType: (weightType) => set({ weightType }),
        
        setIsPlaying: (playing) => set({ isPlaying: playing }),
        togglePlayPause: () => set((state) => ({ isPlaying: !state.isPlaying })),
        setScanSpeed: (speed) => set({ scanSpeed: Math.max(1, Math.min(60, speed)) }),
        setScanRange: (range) => set({ scanRange: range }),
        setInterferenceCancel: (enabled) => set({ interferenceCancel: enabled }),
        
        triggerScan: () => {
          set({ isPlaying: true })
        },
        
        resetSimulation: () => {
          const state = get()
          const wavelength = computeWavelength(DEFAULT_FREQUENCY, state.speedOfSound)
          const spacing = computeSpacing(wavelength, DEFAULT_SPACING_FRACTION)
          
          // Reset active unit
          const newUnits = state.units.map((u) =>
            u.id === state.activeUnitId 
              ? {
                  ...u,
                  frequency: DEFAULT_FREQUENCY,
                  elements: DEFAULT_SENSOR_COUNT,
                  pitch: spacing,
                  steeringAngle: 0,
                  amplitudes: new Array(DEFAULT_SENSOR_COUNT).fill(1),
                }
              : u
          )
          
          set({
            frequency: DEFAULT_FREQUENCY,
            wavelength,
            sensorCount: DEFAULT_SENSOR_COUNT,
            sensorSpacing: spacing,
            spacingLambdaFraction: DEFAULT_SPACING_FRACTION,
            steeringAngle: 0,
            isPlaying: false,
            phaseOffsets: new Array(DEFAULT_SENSOR_COUNT).fill(0),
            weights: new Array(DEFAULT_SENSOR_COUNT).fill(1),
            units: newUnits,
          })
        },
        
        // ─────────────────────────────────────────────────────────────────────
        // Display Settings
        // ─────────────────────────────────────────────────────────────────────
        
        setShowGrid: (show) => set({ showGrid: show }),
        setShowLabels: (show) => set({ showLabels: show }),
        setColormap: (colormap) => set({ colormap }),
        setDynamicRange: (range) => set({ dynamicRange: Math.max(20, Math.min(80, range)) }),
        
        // ─────────────────────────────────────────────────────────────────────
        // Computed Helpers
        // ─────────────────────────────────────────────────────────────────────
        
        computePhaseOffsets: () => {
          const state = get()
          return computePhaseOffsetsForSteering(
            state.sensorCount, state.sensorSpacing, state.wavelength, state.steeringAngle
          )
        },
        
        computeWavelength: () => {
          const state = get()
          return computeWavelength(state.frequency, state.speedOfSound)
        },
      }
    },
    {
      name: 'beam-storage',
      partialize: (state) => ({
        // Persist units array for multi-array support
        units: state.units,
        activeUnitId: state.activeUnitId,
        // Persist global preferences
        medium: state.medium,
        algorithm: state.algorithm,
        weightType: state.weightType,
        scanSpeed: state.scanSpeed,
        scanRange: state.scanRange,
        interferenceCancel: state.interferenceCancel,
        showGrid: state.showGrid,
        showLabels: state.showLabels,
        colormap: state.colormap,
        dynamicRange: state.dynamicRange,
      }),
    }
  )
)

export default useBeamStore
