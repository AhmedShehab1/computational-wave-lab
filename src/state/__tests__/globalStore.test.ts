/**
 * Global Store Unit Tests
 * 
 * Tests for the Zustand global store covering:
 * 1. Initial state correctness
 * 2. Image slot management
 * 3. Mixer configuration
 * 4. Region mask settings
 * 5. Output image management
 * 6. Toast notifications
 * 7. Safe mode toggles
 * 8. Beam configuration
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { useGlobalStore } from '../globalStore'
import type { 
  ImageDataPayload, 
  RegionMask, 
  BrightnessConfig,
  Toast,
  SafeModeState 
} from '@/types'

// Helper to create mock image data
function createMockImageData(width = 100, height = 100): ImageDataPayload {
  return {
    width,
    height,
    pixels: new Uint8ClampedArray(width * height * 4),
  }
}

describe('Global Store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useGlobalStore.setState({
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
      snapshots: [],
      toasts: [],
      safeMode: { active: false },
      beamConfig: {
        arrays: [],
        steering: { theta: 0, phi: 0 },
        renderMode: 'interference',
        widebandMode: 'aggregated',
        resolution: 128,
      },
      beamResult: null,
      beamStatus: 'idle',
    })
  })

  describe('Initial State', () => {
    it('should have correct initial image slots', () => {
      const { images } = useGlobalStore.getState()
      
      expect(images.A).toBeNull()
      expect(images.B).toBeNull()
      expect(images.C).toBeNull()
      expect(images.D).toBeNull()
    })

    it('should have correct initial output status', () => {
      const { outputStatus } = useGlobalStore.getState()
      
      expect(outputStatus[1]).toBe('idle')
      expect(outputStatus[2]).toBe('idle')
    })

    it('should have correct initial region mask', () => {
      const { regionMask } = useGlobalStore.getState()
      
      expect(regionMask.shape).toBe('circle')
      expect(regionMask.mode).toBe('include')
      expect(regionMask.radius).toBe(1)
    })

    it('should have correct initial brightness config', () => {
      const { brightnessConfig } = useGlobalStore.getState()
      
      expect(brightnessConfig.target).toBe('spatial')
      expect(brightnessConfig.value).toBe(0)
      expect(brightnessConfig.contrast).toBe(1)
    })

    it('should have safe mode inactive by default', () => {
      const { safeMode } = useGlobalStore.getState()
      
      expect(safeMode.active).toBe(false)
    })

    it('should have empty snapshots', () => {
      const { snapshots } = useGlobalStore.getState()
      
      expect(snapshots).toHaveLength(0)
    })

    it('should have empty toasts', () => {
      const { toasts } = useGlobalStore.getState()
      
      expect(toasts).toHaveLength(0)
    })
  })

  describe('Image Management', () => {
    it('should set image data for a slot', () => {
      const imageData = createMockImageData()
      
      useGlobalStore.getState().setImageData('A', imageData)
      
      const { images } = useGlobalStore.getState()
      expect(images.A).toBe(imageData)
      expect(images.B).toBeNull()
    })

    it('should clear image data for a slot', () => {
      const imageData = createMockImageData()
      useGlobalStore.getState().setImageData('A', imageData)
      
      useGlobalStore.getState().setImageData('A', null)
      
      expect(useGlobalStore.getState().images.A).toBeNull()
    })

    it('should clear all images', () => {
      useGlobalStore.getState().setImageData('A', createMockImageData())
      useGlobalStore.getState().setImageData('B', createMockImageData())
      
      useGlobalStore.getState().clearImages()
      
      const { images } = useGlobalStore.getState()
      expect(images.A).toBeNull()
      expect(images.B).toBeNull()
      expect(images.C).toBeNull()
      expect(images.D).toBeNull()
    })

    it('should set workspace dimensions', () => {
      useGlobalStore.getState().setWorkspaceDimensions({ width: 800, height: 600 })
      
      const { workspaceDimensions } = useGlobalStore.getState()
      expect(workspaceDimensions.width).toBe(800)
      expect(workspaceDimensions.height).toBe(600)
    })

    it('should set normalized size', () => {
      useGlobalStore.getState().setNormalizedSize({ width: 512, height: 512 })
      
      const { normalizedSize } = useGlobalStore.getState()
      expect(normalizedSize?.width).toBe(512)
      expect(normalizedSize?.height).toBe(512)
    })
  })

  describe('Mixer Configuration', () => {
    it('should set mixer weights', () => {
      useGlobalStore.getState().setMixerWeights([0.25, 0.25, 0.25, 0.25])
      
      const { mixerWeights } = useGlobalStore.getState()
      expect(mixerWeights).toEqual([0.25, 0.25, 0.25, 0.25])
    })

    it('should set mixer config', () => {
      useGlobalStore.getState().setMixerConfig({ values: [1, 0, 0, 0] })
      
      const { mixerConfig } = useGlobalStore.getState()
      expect(mixerConfig.values).toEqual([1, 0, 0, 0])
    })
  })

  describe('Region Mask', () => {
    it('should update region mask shape', () => {
      const newMask: RegionMask = { shape: 'rectangle', mode: 'exclude', radius: 0.5 }
      
      useGlobalStore.getState().setRegionMask(newMask)
      
      const { regionMask } = useGlobalStore.getState()
      expect(regionMask.shape).toBe('rectangle')
      expect(regionMask.mode).toBe('exclude')
      expect(regionMask.radius).toBe(0.5)
    })
  })

  describe('Brightness Config', () => {
    it('should update brightness config', () => {
      const newConfig: BrightnessConfig = { target: 'frequency', value: 50, contrast: 1.5 }
      
      useGlobalStore.getState().setBrightnessConfig(newConfig)
      
      const { brightnessConfig } = useGlobalStore.getState()
      expect(brightnessConfig.target).toBe('frequency')
      expect(brightnessConfig.value).toBe(50)
      expect(brightnessConfig.contrast).toBe(1.5)
    })
  })

  describe('Output Management', () => {
    it('should set output image', () => {
      const imageData = createMockImageData()
      
      useGlobalStore.getState().setOutputImage(1, imageData)
      
      expect(useGlobalStore.getState().outputImages[1]).toBe(imageData)
    })

    it('should set output status', () => {
      useGlobalStore.getState().setOutputStatus(1, 'mixing')
      
      expect(useGlobalStore.getState().outputStatus[1]).toBe('mixing')
    })

    it('should set mixer progress', () => {
      useGlobalStore.getState().setMixerProgress(1, 50)
      
      expect(useGlobalStore.getState().mixerProgress[1]).toBe(50)
    })

    it('should clear mixer progress', () => {
      useGlobalStore.getState().setMixerProgress(1, 100)
      useGlobalStore.getState().setMixerProgress(1, null)
      
      expect(useGlobalStore.getState().mixerProgress[1]).toBeNull()
    })
  })

  describe('Toast Notifications', () => {
    it('should push a toast', () => {
      const toast: Toast = { id: 'toast-1', type: 'info', message: 'Test message' }
      
      useGlobalStore.getState().pushToast(toast)
      
      const { toasts } = useGlobalStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0]).toEqual(toast)
    })

    it('should push multiple toasts', () => {
      useGlobalStore.getState().pushToast({ id: '1', type: 'info', message: 'First' })
      useGlobalStore.getState().pushToast({ id: '2', type: 'error', message: 'Second' })
      
      expect(useGlobalStore.getState().toasts).toHaveLength(2)
    })

    it('should remove a toast by id', () => {
      useGlobalStore.getState().pushToast({ id: '1', type: 'info', message: 'First' })
      useGlobalStore.getState().pushToast({ id: '2', type: 'info', message: 'Second' })
      
      useGlobalStore.getState().removeToast('1')
      
      const { toasts } = useGlobalStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].id).toBe('2')
    })
  })

  describe('Safe Mode', () => {
    it('should enable safe mode', () => {
      useGlobalStore.getState().setSafeMode({ active: true })
      
      expect(useGlobalStore.getState().safeMode.active).toBe(true)
    })

    it('should disable safe mode', () => {
      useGlobalStore.getState().setSafeMode({ active: true })
      useGlobalStore.getState().setSafeMode({ active: false })
      
      expect(useGlobalStore.getState().safeMode.active).toBe(false)
    })

    it('should preserve additional safe mode properties', () => {
      const safeState: SafeModeState = { active: true, reason: 'memory' }
      
      useGlobalStore.getState().setSafeMode(safeState)
      
      const { safeMode } = useGlobalStore.getState()
      expect(safeMode.active).toBe(true)
      expect(safeMode.reason).toBe('memory')
    })
  })

  describe('Snapshots', () => {
    it('should add a snapshot', () => {
      const image = createMockImageData()
      
      useGlobalStore.getState().addSnapshot(1, image)
      
      const { snapshots } = useGlobalStore.getState()
      expect(snapshots).toHaveLength(1)
      expect(snapshots[0].viewport).toBe(1)
      expect(snapshots[0].image).toBe(image)
    })

    it('should have createdAt timestamp', () => {
      const before = Date.now()
      useGlobalStore.getState().addSnapshot(1, createMockImageData())
      const after = Date.now()
      
      const { createdAt } = useGlobalStore.getState().snapshots[0]
      expect(createdAt).toBeGreaterThanOrEqual(before)
      expect(createdAt).toBeLessThanOrEqual(after)
    })

    it('should generate unique snapshot ids', () => {
      useGlobalStore.getState().addSnapshot(1, createMockImageData())
      useGlobalStore.getState().addSnapshot(1, createMockImageData())
      
      const { snapshots } = useGlobalStore.getState()
      expect(snapshots[0].id).not.toBe(snapshots[1].id)
    })

    it('should remove a snapshot by id', () => {
      useGlobalStore.getState().addSnapshot(1, createMockImageData())
      const snapshotId = useGlobalStore.getState().snapshots[0].id
      
      useGlobalStore.getState().removeSnapshot(snapshotId)
      
      expect(useGlobalStore.getState().snapshots).toHaveLength(0)
    })

    it('should clear all snapshots', () => {
      useGlobalStore.getState().addSnapshot(1, createMockImageData())
      useGlobalStore.getState().addSnapshot(2, createMockImageData())
      
      useGlobalStore.getState().clearSnapshots()
      
      expect(useGlobalStore.getState().snapshots).toHaveLength(0)
    })

    it('should cap snapshots at 10 (evicting oldest)', () => {
      for (let i = 0; i < 12; i++) {
        useGlobalStore.getState().addSnapshot(1, createMockImageData())
      }
      
      expect(useGlobalStore.getState().snapshots).toHaveLength(10)
    })
  })

  describe('Compare Selection', () => {
    it('should set compare selection', () => {
      useGlobalStore.getState().setCompareSelection(1, 'snapshot-123')
      
      expect(useGlobalStore.getState().compareSelection[1]).toBe('snapshot-123')
    })

    it('should clear compare selection', () => {
      useGlobalStore.getState().setCompareSelection(1, 'snapshot-123')
      useGlobalStore.getState().setCompareSelection(1, null)
      
      expect(useGlobalStore.getState().compareSelection[1]).toBeNull()
    })
  })

  describe('FFT Mode', () => {
    it('should set FFT mode to js', () => {
      useGlobalStore.getState().setFftMode('js')
      
      expect(useGlobalStore.getState().fftMode).toBe('js')
    })

    it('should set FFT mode to wasm', () => {
      useGlobalStore.getState().setFftMode('wasm')
      
      expect(useGlobalStore.getState().fftMode).toBe('wasm')
    })
  })

  describe('Beam Configuration', () => {
    it('should update steering angles', () => {
      useGlobalStore.getState().setBeamConfig({ steering: { theta: 45, phi: 30 } })
      
      const { beamConfig } = useGlobalStore.getState()
      expect(beamConfig.steering.theta).toBe(45)
      expect(beamConfig.steering.phi).toBe(30)
    })

    it('should update render mode', () => {
      useGlobalStore.getState().setBeamConfig({ renderMode: 'pressure' })
      
      expect(useGlobalStore.getState().beamConfig.renderMode).toBe('pressure')
    })

    it('should update resolution', () => {
      useGlobalStore.getState().setBeamConfig({ resolution: 256 })
      
      expect(useGlobalStore.getState().beamConfig.resolution).toBe(256)
    })

    it('should preserve existing config when partial update', () => {
      useGlobalStore.getState().setBeamConfig({ steering: { theta: 45, phi: 30 } })
      useGlobalStore.getState().setBeamConfig({ resolution: 256 })
      
      const { beamConfig } = useGlobalStore.getState()
      expect(beamConfig.steering.theta).toBe(45)
      expect(beamConfig.resolution).toBe(256)
    })

    it('should set beam result', () => {
      const result = { 
        heatmap: new Float32Array(100),
        width: 10,
        height: 10,
      }
      
      useGlobalStore.getState().setBeamResult(result as any)
      
      expect(useGlobalStore.getState().beamResult).toBe(result)
    })

    it('should clear beam result', () => {
      useGlobalStore.getState().setBeamResult({ heatmap: new Float32Array(100), width: 10, height: 10 } as any)
      useGlobalStore.getState().setBeamResult(null)
      
      expect(useGlobalStore.getState().beamResult).toBeNull()
    })

    it('should set beam status', () => {
      useGlobalStore.getState().setBeamStatus('running')
      
      expect(useGlobalStore.getState().beamStatus).toBe('running')
    })
  })

  describe('File Management', () => {
    it('should set files array', () => {
      const files = [
        { id: 'A', name: 'test.png', size: 1000, type: 'image/png' },
      ]
      
      useGlobalStore.getState().setFiles(files as any)
      
      expect(useGlobalStore.getState().files).toHaveLength(1)
    })

    it('should set file meta for slot', () => {
      const meta = { id: 'A', name: 'test.png', size: 1000, type: 'image/png' }
      
      useGlobalStore.getState().setFileMeta('A', meta as any)
      
      const { files } = useGlobalStore.getState()
      expect(files).toContainEqual(meta)
    })

    it('should replace existing file meta for same slot', () => {
      const meta1 = { id: 'A', name: 'test1.png', size: 1000, type: 'image/png' }
      const meta2 = { id: 'A', name: 'test2.png', size: 2000, type: 'image/png' }
      
      useGlobalStore.getState().setFileMeta('A', meta1 as any)
      useGlobalStore.getState().setFileMeta('A', meta2 as any)
      
      const { files } = useGlobalStore.getState()
      expect(files).toHaveLength(1)
      expect(files[0].name).toBe('test2.png')
    })
  })

  describe('Scenarios', () => {
    it('should set scenarios', () => {
      const scenarios = [{ id: '1', name: 'Test Scenario' }]
      
      useGlobalStore.getState().setScenarios(scenarios as any)
      
      expect(useGlobalStore.getState().scenarios).toEqual(scenarios)
    })
  })
})
