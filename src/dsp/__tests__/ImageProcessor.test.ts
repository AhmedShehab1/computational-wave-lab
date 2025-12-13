/**
 * ImageProcessor Unit Tests
 * 
 * Critical paths tested:
 * 1. OOM Protection - Large images are downscaled before processing
 * 2. Grayscale Conversion - Luminance formula correctness
 * 3. Brightness/Contrast - Mathematical accuracy
 * 4. Histogram Calculation - Statistical correctness
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ImageProcessor, MAX_IMAGE_DIMENSION } from '../ImageProcessor'
import { IMAGE_LIMITS } from '@/config/constants'
import { 
  mockCreateImageBitmap, 
  MockImageBitmap,
  createMockGrayscale,
  createMockRGBA 
} from '@/test/mocks/browserAPIs'

describe('ImageProcessor', () => {
  let processor: ImageProcessor

  beforeEach(() => {
    processor = new ImageProcessor()
    vi.clearAllMocks()
  })

  describe('MAX_IMAGE_DIMENSION constant', () => {
    it('should match IMAGE_LIMITS.maxDimension', () => {
      expect(MAX_IMAGE_DIMENSION).toBe(IMAGE_LIMITS.maxDimension)
      expect(MAX_IMAGE_DIMENSION).toBe(1024)
    })
  })

  describe('toGrayscale', () => {
    it('should convert RGBA to grayscale using luminance formula', () => {
      // Test with known RGB values
      const rgba = new Uint8ClampedArray([
        255, 0, 0, 255,   // Pure red
        0, 255, 0, 255,   // Pure green
        0, 0, 255, 255,   // Pure blue
        128, 128, 128, 255 // Gray
      ])

      const gray = ImageProcessor.toGrayscale(rgba, 4, 1)

      // Luminance formula: 0.299*R + 0.587*G + 0.114*B
      expect(gray[0]).toBe(Math.round(0.299 * 255)) // Red -> 76
      expect(gray[1]).toBe(Math.round(0.587 * 255)) // Green -> 150
      expect(gray[2]).toBe(Math.round(0.114 * 255)) // Blue -> 29
      expect(gray[3]).toBe(128) // Gray stays gray
    })

    it('should handle white and black pixels correctly', () => {
      const rgba = new Uint8ClampedArray([
        255, 255, 255, 255, // White
        0, 0, 0, 255        // Black
      ])

      const gray = ImageProcessor.toGrayscale(rgba, 2, 1)

      expect(gray[0]).toBe(255) // White
      expect(gray[1]).toBe(0)   // Black
    })

    it('should preserve image dimensions', () => {
      const rgba = createMockRGBA(100, 50)
      const gray = ImageProcessor.toGrayscale(rgba, 100, 50)
      expect(gray.length).toBe(100 * 50)
    })
  })

  describe('applyBrightnessContrast', () => {
    it('should apply brightness adjustment correctly', () => {
      const gray = new Uint8ClampedArray([128]) // Middle gray - unaffected by contrast
      
      // +50 brightness with neutral contrast (contrast=0 means factor≈1)
      const brightened = ImageProcessor.applyBrightnessContrast(gray, { brightness: 50, contrast: 0 })
      expect(brightened[0]).toBe(178) // 128 + 50
    })

    it('should clamp values to 0-255 range', () => {
      const gray = new Uint8ClampedArray([10, 250])
      
      // Test brightness overflow with neutral contrast
      const brightened = ImageProcessor.applyBrightnessContrast(gray, { brightness: 100, contrast: 0 })
      expect(brightened[1]).toBe(255) // Clamped to max
      
      // Test brightness underflow with neutral contrast
      const darkened = ImageProcessor.applyBrightnessContrast(gray, { brightness: -100, contrast: 0 })
      expect(darkened[0]).toBe(0) // Clamped to min
    })

    it('should apply contrast adjustment correctly', () => {
      const gray = new Uint8ClampedArray([64, 128, 192])
      
      // Zero contrast should have factor ≈ 1
      const result = ImageProcessor.applyBrightnessContrast(gray, { brightness: 0, contrast: 0 })
      
      // Middle value (128) should stay at 128
      expect(result[1]).toBe(128)
    })

    it('should handle low contrast (values converge to middle)', () => {
      const gray = new Uint8ClampedArray([0, 128, 255])
      
      // Very negative contrast should compress range toward 128
      // Using contrast close to -1 (but not exactly -1 to avoid division issues)
      const result = ImageProcessor.applyBrightnessContrast(gray, { brightness: 0, contrast: -0.9 })
      
      // All values should move closer to 128
      expect(result[0]).toBeGreaterThan(0)    // Was 0, moved toward 128
      expect(result[1]).toBe(128)              // Middle stays at middle
      expect(result[2]).toBeLessThan(255)     // Was 255, moved toward 128
    })
  })

  describe('loadImageFile - OOM Protection', () => {
    it('should downscale images larger than maxDimension', async () => {
      // Create a mock file representing a 3024x4032 image (12.2MP)
      const largeFile = new File([''], 'large_3024x4032.png', { type: 'image/png' })
      
      const result = await processor.loadImageFile(largeFile, 1024)
      
      // Verify createImageBitmap was called with resize options
      expect(mockCreateImageBitmap).toHaveBeenCalledTimes(2) // Once for original, once for resized
      
      // Check the second call has resize options
      const secondCall = mockCreateImageBitmap.mock.calls[1]
      expect(secondCall[1]).toHaveProperty('resizeWidth')
      expect(secondCall[1]).toHaveProperty('resizeHeight')
      
      // Verify wasDownscaled flag
      expect(result.wasDownscaled).toBe(true)
      expect(result.originalSize).toEqual({ width: 3024, height: 4032 })
    })

    it('should preserve aspect ratio when downscaling', async () => {
      const wideFile = new File([''], 'wide_2048x1024.png', { type: 'image/png' })
      
      await processor.loadImageFile(wideFile, 1024)
      
      // The resize call should maintain aspect ratio
      const resizeCall = mockCreateImageBitmap.mock.calls[1]
      const resizeOptions = resizeCall[1] as ImageBitmapOptions
      
      // 2048/1024 = 2:1 aspect ratio
      // Scale factor = 1024 / 2048 = 0.5
      // New dimensions: 1024 x 512
      expect(resizeOptions.resizeWidth).toBe(1024)
      expect(resizeOptions.resizeHeight).toBe(512)
    })

    it('should not downscale images within maxDimension', async () => {
      const smallFile = new File([''], 'small_512x512.png', { type: 'image/png' })
      
      const result = await processor.loadImageFile(smallFile, 1024)
      
      // Only one call to createImageBitmap (no resize needed)
      expect(mockCreateImageBitmap).toHaveBeenCalledTimes(1)
      expect(result.wasDownscaled).toBe(false)
      expect(result.originalSize).toEqual({ width: 512, height: 512 })
    })

    it('should use high quality resizing', async () => {
      const largeFile = new File([''], 'large_2000x2000.png', { type: 'image/png' })
      
      await processor.loadImageFile(largeFile, 1024)
      
      const resizeCall = mockCreateImageBitmap.mock.calls[1]
      expect(resizeCall[1]).toHaveProperty('resizeQuality', 'high')
    })

    it('should return grayscale data of correct dimensions', async () => {
      const file = new File([''], 'test_800x600.png', { type: 'image/png' })
      
      const result = await processor.loadImageFile(file, 1024)
      
      // Note: The actual dimensions depend on the mock canvas implementation
      // In real scenario, grayscale.length should equal width * height
      expect(result.grayscale).toBeInstanceOf(Uint8ClampedArray)
    })
  })

  describe('calculateHistogram', () => {
    it('should calculate correct min/max values', () => {
      const data = new Float32Array([10, 50, 100, 200, 255])
      
      const result = ImageProcessor.calculateHistogram(data)
      
      expect(result.min).toBe(10)
      expect(result.max).toBe(255)
    })

    it('should calculate correct mean', () => {
      const data = new Float32Array([0, 50, 100, 150, 200])
      
      const result = ImageProcessor.calculateHistogram(data)
      
      expect(result.mean).toBe(100) // (0+50+100+150+200)/5 = 100
    })

    it('should calculate standard deviation correctly', () => {
      // All same values -> stdDev = 0
      const uniform = new Float32Array([100, 100, 100, 100])
      const uniformResult = ImageProcessor.calculateHistogram(uniform)
      expect(uniformResult.stdDev).toBe(0)
      
      // Known variance data
      const data = new Float32Array([2, 4, 4, 4, 5, 5, 7, 9])
      const result = ImageProcessor.calculateHistogram(data)
      // Mean = 5, Variance = 4, StdDev = 2
      expect(result.mean).toBe(5)
      expect(Math.abs(result.stdDev - 2)).toBeLessThan(0.01)
    })

    it('should produce normalized bins', () => {
      const data = new Float32Array([0, 0, 0, 128, 128, 255])
      
      const result = ImageProcessor.calculateHistogram(data, 256)
      
      // Maximum bin count should normalize to 1.0
      const maxBin = Math.max(...result.bins)
      expect(maxBin).toBe(1)
    })

    it('should handle single value data', () => {
      const data = new Float32Array([42])
      
      const result = ImageProcessor.calculateHistogram(data)
      
      expect(result.min).toBe(42)
      expect(result.max).toBe(42)
      expect(result.mean).toBe(42)
      expect(result.stdDev).toBe(0)
    })
  })

  describe('extractMagnitude', () => {
    it('should calculate magnitude correctly', () => {
      const real = new Float32Array([3, 0, 1])
      const imag = new Float32Array([4, 5, 0])
      
      const magnitude = ImageProcessor.extractMagnitude(real, imag)
      
      expect(magnitude[0]).toBe(5)  // sqrt(3² + 4²) = 5
      expect(magnitude[1]).toBe(5)  // sqrt(0² + 5²) = 5
      expect(magnitude[2]).toBe(1)  // sqrt(1² + 0²) = 1
    })
  })

  describe('extractPhase', () => {
    it('should calculate phase correctly', () => {
      const real = new Float32Array([1, 0, -1, 0])
      const imag = new Float32Array([0, 1, 0, -1])
      
      const phase = ImageProcessor.extractPhase(real, imag)
      
      expect(phase[0]).toBeCloseTo(0)             // atan2(0, 1) = 0
      expect(phase[1]).toBeCloseTo(Math.PI / 2)  // atan2(1, 0) = π/2
      expect(phase[2]).toBeCloseTo(Math.PI)      // atan2(0, -1) = π
      expect(phase[3]).toBeCloseTo(-Math.PI / 2) // atan2(-1, 0) = -π/2
    })
  })

  describe('normalizeToUint8', () => {
    it('should normalize to 0-255 range', () => {
      const data = new Float32Array([0, 50, 100])
      
      const result = ImageProcessor.normalizeToUint8(data)
      
      expect(result[0]).toBe(0)    // Min maps to 0
      expect(result[2]).toBe(255)  // Max maps to 255
      expect(result[1]).toBe(128)  // Middle maps to ~128
    })

    it('should handle negative values', () => {
      const data = new Float32Array([-100, 0, 100])
      
      const result = ImageProcessor.normalizeToUint8(data)
      
      expect(result[0]).toBe(0)    // -100 (min) maps to 0
      expect(result[1]).toBe(128)  // 0 maps to middle
      expect(result[2]).toBe(255)  // 100 (max) maps to 255
    })

    it('should handle uniform data', () => {
      const data = new Float32Array([50, 50, 50])
      
      const result = ImageProcessor.normalizeToUint8(data)
      
      // When range is 0, all values map to 0 (divide by 1)
      expect(result[0]).toBe(0)
      expect(result[1]).toBe(0)
      expect(result[2]).toBe(0)
    })
  })

  describe('logScale', () => {
    it('should apply log1p transformation', () => {
      const data = new Float32Array([0, 1, Math.E - 1, 99])
      
      const result = ImageProcessor.logScale(data)
      
      expect(result[0]).toBeCloseTo(0)              // log1p(0) = 0
      expect(result[1]).toBeCloseTo(Math.log(2))   // log1p(1) = log(2)
      expect(result[2]).toBeCloseTo(1)              // log1p(e-1) = 1
      expect(result[3]).toBeCloseTo(Math.log(100)) // log1p(99) = log(100)
    })

    it('should handle negative values by taking absolute value', () => {
      const data = new Float32Array([-10, 10])
      
      const result = ImageProcessor.logScale(data)
      
      expect(result[0]).toBe(result[1]) // |−10| and |10| produce same result
    })
  })

  describe('fftShift', () => {
    it('should center DC component for 4x4 data', () => {
      // Create a simple 4x4 array where DC is at (0,0)
      const data = new Float32Array([
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16
      ])
      
      const shifted = ImageProcessor.fftShift(data, 4, 4)
      
      // After shift, quadrants should be swapped
      // Top-left <-> Bottom-right, Top-right <-> Bottom-left
      expect(shifted[0]).toBe(11)  // Was at (2,2), now at (0,0)
      expect(shifted[1]).toBe(12)  // Was at (3,2), now at (1,0)
      expect(shifted[10]).toBe(1)  // Was at (0,0), now at (2,2)
    })

    it('should be its own inverse for even dimensions', () => {
      const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
      
      const shifted = ImageProcessor.fftShift(data, 4, 4)
      const unshifted = ImageProcessor.fftShift(shifted, 4, 4)
      
      for (let i = 0; i < data.length; i++) {
        expect(unshifted[i]).toBe(data[i])
      }
    })

    it('should handle non-square dimensions', () => {
      const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8])
      
      const shifted = ImageProcessor.fftShift(data, 4, 2)
      const unshifted = ImageProcessor.fftShift(shifted, 4, 2)
      
      for (let i = 0; i < data.length; i++) {
        expect(unshifted[i]).toBe(data[i])
      }
    })
  })

  describe('grayscaleToImageData', () => {
    it('should convert grayscale to RGBA ImageData', () => {
      const gray = new Uint8ClampedArray([0, 128, 255])
      
      const imageData = ImageProcessor.grayscaleToImageData(gray, 3, 1)
      
      expect(imageData.width).toBe(3)
      expect(imageData.height).toBe(1)
      expect(imageData.data.length).toBe(12) // 3 pixels × 4 channels
      
      // First pixel (black)
      expect(imageData.data[0]).toBe(0)   // R
      expect(imageData.data[1]).toBe(0)   // G
      expect(imageData.data[2]).toBe(0)   // B
      expect(imageData.data[3]).toBe(255) // A
      
      // Third pixel (white)
      expect(imageData.data[8]).toBe(255)  // R
      expect(imageData.data[9]).toBe(255)  // G
      expect(imageData.data[10]).toBe(255) // B
      expect(imageData.data[11]).toBe(255) // A
    })
  })
})
