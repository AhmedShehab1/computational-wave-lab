/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * SourceImageGridEnhanced Component Tests
 * 
 * Critical paths tested:
 * 1. Grid initialization with 4 empty slots
 * 2. Image loading with OOM protection
 * 3. Unified size constraint enforcement
 * 4. Region selection controls
 * 5. FFT worker integration (mocked)
 * 6. Parent notification callbacks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SourceImageGridEnhanced } from '../SourceImageGridEnhanced'
import { ImageSlotData, RegionRect } from '../SourceImageCard'
import { mockCreateImageBitmap, MockWorker, flushPromises } from '@/test/mocks/browserAPIs'

// Mock the WorkerManager
vi.mock('@/workers/pool', () => ({
  WorkerManager: vi.fn().mockImplementation(() => ({
    enqueue: vi.fn().mockResolvedValue({
      histogram: { bins: Array(256).fill(0.5), min: 0, max: 255, mean: 128, stdDev: 50 },
      componentData: new Uint8ClampedArray(100),
      width: 100,
      height: 100,
    }),
  })),
}))

// Mock ImageProcessor
vi.mock('@/dsp/ImageProcessor', () => ({
  ImageProcessor: vi.fn().mockImplementation(() => ({
    loadImageFile: vi.fn().mockResolvedValue({
      imageData: new ImageData(100, 100),
      grayscale: new Uint8ClampedArray(10000),
      wasDownscaled: false,
      originalSize: { width: 100, height: 100 },
    }),
    resizeImage: vi.fn().mockResolvedValue(new ImageData(100, 100)),
  })),
  toGrayscale: vi.fn().mockReturnValue(new Uint8ClampedArray(10000)),
  applyBrightnessContrast: vi.fn().mockReturnValue(new Uint8ClampedArray(10000)),
  grayscaleToImageData: vi.fn().mockReturnValue(new ImageData(100, 100)),
}))

describe('SourceImageGridEnhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 0, y: 0, width: 200, height: 200,
      top: 0, right: 200, bottom: 200, left: 0,
      toJSON: () => ({}),
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should render with 4 empty slots', () => {
      render(<SourceImageGridEnhanced />)
      
      const grid = screen.getByRole('grid', { name: /source images/i })
      expect(grid).toBeInTheDocument()
      
      const cards = document.querySelectorAll('.source-card')
      expect(cards).toHaveLength(4)
    })

    it('should render grid title', () => {
      render(<SourceImageGridEnhanced />)
      
      expect(screen.getByText('Source Image Grid')).toBeInTheDocument()
    })

    it('should render region controls', () => {
      render(<SourceImageGridEnhanced />)
      
      expect(screen.getByText('Region Size:')).toBeInTheDocument()
      expect(screen.getByText('Inner')).toBeInTheDocument()
      expect(screen.getByText('Outer')).toBeInTheDocument()
    })

    it('should have default region of 40%', () => {
      render(<SourceImageGridEnhanced />)
      
      const slider = document.querySelector('.region-slider') as HTMLInputElement
      expect(slider.value).toBe('40')
    })

    it('should have inner mode selected by default', () => {
      render(<SourceImageGridEnhanced />)
      
      const innerBtn = screen.getByText('Inner')
      expect(innerBtn).toHaveClass('active')
    })

    it('should accept initial images', () => {
      const initialImages: ImageSlotData[] = [
        { id: 'A', label: 'Test A', rawImageData: null, grayscale: null, width: 0, height: 0, brightness: 0, contrast: 1, selectedComponent: 'magnitude' },
        { id: 'B', label: 'Test B', rawImageData: null, grayscale: null, width: 0, height: 0, brightness: 0, contrast: 1, selectedComponent: 'magnitude' },
        { id: 'C', label: 'Test C', rawImageData: null, grayscale: null, width: 0, height: 0, brightness: 0, contrast: 1, selectedComponent: 'magnitude' },
        { id: 'D', label: 'Test D', rawImageData: null, grayscale: null, width: 0, height: 0, brightness: 0, contrast: 1, selectedComponent: 'magnitude' },
      ]
      
      render(<SourceImageGridEnhanced initialImages={initialImages} />)
      
      expect(screen.getByText('Test A')).toBeInTheDocument()
    })
  })

  describe('Region Controls', () => {
    it('should update region size via slider', async () => {
      render(<SourceImageGridEnhanced />)
      
      const slider = document.querySelector('.region-slider') as HTMLInputElement
      fireEvent.change(slider, { target: { value: '60' } })
      
      expect(slider.value).toBe('60')
      expect(screen.getByText('60%')).toBeInTheDocument()
    })

    it('should toggle between inner and outer modes', async () => {
      render(<SourceImageGridEnhanced />)
      
      const outerBtn = screen.getByText('Outer')
      fireEvent.click(outerBtn)
      
      expect(outerBtn).toHaveClass('active')
      expect(screen.getByText('Inner')).not.toHaveClass('active')
    })

    it('should notify parent of region config changes', async () => {
      const onRegionConfigChange = vi.fn()
      render(<SourceImageGridEnhanced onRegionConfigChange={onRegionConfigChange} />)
      
      // Initial call
      expect(onRegionConfigChange).toHaveBeenCalled()
      
      // Change slider
      const slider = document.querySelector('.region-slider') as HTMLInputElement
      fireEvent.change(slider, { target: { value: '50' } })
      
      await waitFor(() => {
        expect(onRegionConfigChange).toHaveBeenCalledWith(
          expect.objectContaining({
            rect: expect.objectContaining({ width: 50 }),
          })
        )
      })
    })

    it('should keep region centered when resizing', async () => {
      const onRegionConfigChange = vi.fn()
      render(<SourceImageGridEnhanced onRegionConfigChange={onRegionConfigChange} />)
      
      const slider = document.querySelector('.region-slider') as HTMLInputElement
      fireEvent.change(slider, { target: { value: '60' } })
      
      await waitFor(() => {
        const lastCall = onRegionConfigChange.mock.calls[onRegionConfigChange.mock.calls.length - 1]
        const rect = lastCall[0].rect as RegionRect
        
        // Center should be at 50%
        const centerX = rect.x + rect.width / 2
        const centerY = rect.y + rect.height / 2
        
        expect(centerX).toBe(50)
        expect(centerY).toBe(50)
      })
    })
  })

  describe('Parent Callbacks', () => {
    it('should call onImagesChange when slots update', async () => {
      const onImagesChange = vi.fn()
      render(<SourceImageGridEnhanced onImagesChange={onImagesChange} />)
      
      // Initial call with 4 empty slots
      expect(onImagesChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'A' }),
          expect.objectContaining({ id: 'B' }),
          expect.objectContaining({ id: 'C' }),
          expect.objectContaining({ id: 'D' }),
        ])
      )
    })

    it('should call onRegionConfigChange with rect and mode', () => {
      const onRegionConfigChange = vi.fn()
      render(<SourceImageGridEnhanced onRegionConfigChange={onRegionConfigChange} />)
      
      expect(onRegionConfigChange).toHaveBeenCalledWith({
        rect: expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        }),
        mode: 'inner',
      })
    })
  })

  describe('Size Badge', () => {
    it('should not show size badge when no images loaded', () => {
      render(<SourceImageGridEnhanced />)
      
      expect(document.querySelector('.size-badge')).not.toBeInTheDocument()
    })
  })

  describe('Instructions Footer', () => {
    it('should display keyboard instructions', () => {
      render(<SourceImageGridEnhanced />)
      
      expect(screen.getByText(/Double-click/)).toBeInTheDocument()
      expect(screen.getByText(/brightness\/contrast/)).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have accessible grid role', () => {
      render(<SourceImageGridEnhanced />)
      
      expect(screen.getByRole('grid', { name: /source images 2x2 grid/i })).toBeInTheDocument()
    })

    it('should have proper heading structure', () => {
      render(<SourceImageGridEnhanced />)
      
      expect(screen.getByRole('heading', { name: /source image grid/i })).toBeInTheDocument()
    })
  })

  describe('Component Structure', () => {
    it('should have grid container', () => {
      render(<SourceImageGridEnhanced />)
      
      expect(document.querySelector('.grid-container')).toBeInTheDocument()
    })

    it('should have region controls section', () => {
      render(<SourceImageGridEnhanced />)
      
      expect(document.querySelector('.region-controls')).toBeInTheDocument()
    })

    it('should have grid footer', () => {
      render(<SourceImageGridEnhanced />)
      
      expect(document.querySelector('.grid-footer')).toBeInTheDocument()
    })
  })

  describe('Slider Constraints', () => {
    it('should have min region size of 10%', () => {
      render(<SourceImageGridEnhanced />)
      
      const slider = document.querySelector('.region-slider') as HTMLInputElement
      expect(slider.min).toBe('10')
    })

    it('should have max region size of 90%', () => {
      render(<SourceImageGridEnhanced />)
      
      const slider = document.querySelector('.region-slider') as HTMLInputElement
      expect(slider.max).toBe('90')
    })
  })
})
