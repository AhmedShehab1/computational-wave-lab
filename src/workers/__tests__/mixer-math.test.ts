/**
 * DSP Verification Test Suite for FFT Mixer Worker
 * 
 * Treats the worker as a "black box" and verifies mathematical correctness
 * of the output against known mathematical truths using synthetic test signals.
 * 
 * Key principles:
 * - Impulse at (0,0) → FFT = Constant magnitude 1, phase 0
 * - Constant image → FFT has energy only at DC component
 * - Linear algebra: weighted sums in frequency domain
 */

import { describe, expect, it } from 'vitest'
import { runMixerJob } from '../fft-mixer.worker'
import type { MixerJobPayload, MixerChannel, ImageSlotId, MixerWeights } from '@/types'

// ============================================================================
// TEST SIGNAL GENERATORS
// ============================================================================

/**
 * Create a 4x4 impulse image (single white pixel at specified position)
 * FFT of impulse at (0,0) = uniform magnitude, zero phase
 */
function createImpulseImage(
  id: ImageSlotId,
  size = 4,
  impulseX = 0,
  impulseY = 0,
  value = 255
): { id: ImageSlotId; width: number; height: number; pixels: Uint8ClampedArray } {
  const pixels = new Uint8ClampedArray(size * size)
  pixels[impulseY * size + impulseX] = value
  return { id, width: size, height: size, pixels }
}

/**
 * Create a constant (flat gray) image
 * FFT of constant = DC component only (all energy at center)
 */
function createConstantImage(
  id: ImageSlotId,
  size = 4,
  value = 128
): { id: ImageSlotId; width: number; height: number; pixels: Uint8ClampedArray } {
  const pixels = new Uint8ClampedArray(size * size).fill(value)
  return { id, width: size, height: size, pixels }
}

/**
 * Create a shifted impulse (phase shifted by π)
 * An impulse at (size/2, size/2) has alternating phase pattern
 */
function createShiftedImpulse(
  id: ImageSlotId,
  size = 4,
  value = 255
): { id: ImageSlotId; width: number; height: number; pixels: Uint8ClampedArray } {
  const pixels = new Uint8ClampedArray(size * size)
  const halfSize = Math.floor(size / 2)
  pixels[halfSize * size + halfSize] = value
  return { id, width: size, height: size, pixels }
}

// ============================================================================
// MIXER CHANNEL FACTORY
// ============================================================================

function createChannel(
  id: ImageSlotId,
  weight1 = 1,
  weight2 = 1,
  options: Partial<{ locked: boolean; muted: boolean; solo: boolean }> = {}
): MixerChannel {
  return {
    id,
    weight1,
    weight2,
    locked: options.locked ?? false,
    muted: options.muted ?? false,
    solo: options.solo ?? false,
  }
}

function createMixerWeights(
  channels: MixerChannel[],
  mode: 'mag-phase' | 'real-imag' = 'mag-phase'
): MixerWeights {
  return {
    values: channels.map((ch) => ch.weight1),
    locked: false,
    channels,
    mode,
  }
}

// ============================================================================
// PAYLOAD FACTORY
// ============================================================================

function createPayload(
  images: ReturnType<typeof createImpulseImage>[],
  weights: MixerWeights,
  options: Partial<{
    regionMask: MixerJobPayload['regionMask']
    brightnessConfig: MixerJobPayload['brightnessConfig']
  }> = {}
): MixerJobPayload {
  return {
    images,
    weights,
    regionMask: options.regionMask ?? { shape: 'circle', mode: 'include', radius: 1 },
    brightnessConfig: options.brightnessConfig ?? { target: 'spatial', value: 0, contrast: 1 },
    targetViewport: 1,
    fftMode: 'js',
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate mean pixel value
 */
function meanPixelValue(pixels: Uint8ClampedArray): number {
  return pixels.reduce((sum, v) => sum + v, 0) / pixels.length
}

/**
 * Calculate max pixel value
 */
function maxPixelValue(pixels: Uint8ClampedArray): number {
  return Math.max(...pixels)
}

/**
 * Calculate sum of all pixels
 */
function sumPixels(pixels: Uint8ClampedArray): number {
  return pixels.reduce((sum, v) => sum + v, 0)
}

/**
 * Check if all pixels are zero (or below threshold)
 */
function isAllZeros(pixels: Uint8ClampedArray, threshold = 1): boolean {
  return pixels.every((v) => v <= threshold)
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('DSP Verification: FFT Mixer Math', () => {
  describe('Scenario A: Split Personality (Mag vs Phase)', () => {
    it('should take magnitude from one source and phase from another', async () => {
      // Setup: Image A = Impulse at (0,0), Image B = Shifted Impulse at center
      const imageA = createImpulseImage('A', 4, 0, 0, 255)
      const imageB = createShiftedImpulse('B', 4, 255)

      // Action: Unlock sliders
      // Image A: Magnitude=1.0, Phase=0.0 (take mag only)
      // Image B: Magnitude=0.0, Phase=1.0 (take phase only)
      const channelA = createChannel('A', 1.0, 0.0, { locked: false })
      const channelB = createChannel('B', 0.0, 1.0, { locked: false })
      const weights = createMixerWeights([channelA, channelB], 'mag-phase')

      const payload = createPayload([imageA, imageB], weights)
      const result = await runMixerJob('test-mag-phase-split', payload)

      // Verify: Result should have non-zero content (magnitude from A applied to phase from B)
      // When mag=1, phase=0 for A: takes full magnitude, zeroes phase contribution
      // When mag=0, phase=1 for B: zeroes magnitude, takes full phase
      // Net effect: A contributes mag structure, B contributes phase structure
      expect(result.pixels.length).toBe(16)
      
      // The result should NOT be all zeros since we're mixing magnitude from A
      const totalEnergy = sumPixels(result.pixels)
      expect(totalEnergy).toBeGreaterThan(0)
    })

    it('should preserve structure when using full weights on one channel', async () => {
      const imageA = createConstantImage('A', 4, 128)
      
      // Full weights on A: mag=1, phase=1
      const channelA = createChannel('A', 1.0, 1.0, { locked: true })
      const weights = createMixerWeights([channelA], 'mag-phase')

      const payload = createPayload([imageA], weights)
      const result = await runMixerJob('test-identity', payload)

      // FFT → weight(1,1) → IFFT should approximately preserve the image
      const inputMean = meanPixelValue(imageA.pixels)
      const outputMean = meanPixelValue(result.pixels)
      
      // Allow some tolerance for floating point errors
      expect(Math.abs(outputMean - inputMean)).toBeLessThan(10)
    })
  })

  describe('Scenario B: Real/Imag Mode', () => {
    it('should scale real component by weight1 and imag by weight2', async () => {
      // A constant image has all energy in the DC (real) component
      const imageA = createConstantImage('A', 4, 200)

      // Mode: real-imag, weight1=0.5 (halve real), weight2=1.0
      const channelA = createChannel('A', 0.5, 1.0, { locked: false })
      const weights = createMixerWeights([channelA], 'real-imag')

      const payload = createPayload([imageA], weights)
      const result = await runMixerJob('test-real-imag-half', payload)

      // For constant image: FFT produces DC in real, zero imag
      // Scaling real by 0.5 should halve the pixel values
      const inputMean = meanPixelValue(imageA.pixels)
      const outputMean = meanPixelValue(result.pixels)

      // Output should be approximately half of input (with some FFT rounding)
      expect(outputMean).toBeLessThan(inputMean)
      expect(outputMean).toBeGreaterThan(inputMean * 0.3) // Allow tolerance
      expect(outputMean).toBeLessThan(inputMean * 0.7) // Should be around 0.5
    })

    it('should zero output when real weight is 0 for constant image', async () => {
      const imageA = createConstantImage('A', 4, 200)

      // Zero the real component entirely
      const channelA = createChannel('A', 0.0, 1.0, { locked: false })
      const weights = createMixerWeights([channelA], 'real-imag')

      const payload = createPayload([imageA], weights)
      const result = await runMixerJob('test-real-imag-zero', payload)

      // Constant image has no imaginary component, so zeroing real = zero output
      expect(isAllZeros(result.pixels, 2)).toBe(true)
    })

    it('should preserve image when both real and imag weights are 1', async () => {
      const imageA = createImpulseImage('A', 4, 1, 1, 200)

      const channelA = createChannel('A', 1.0, 1.0, { locked: true })
      const weights = createMixerWeights([channelA], 'real-imag')

      const payload = createPayload([imageA], weights)
      const result = await runMixerJob('test-real-imag-identity', payload)

      // Should approximately preserve the impulse
      const inputSum = sumPixels(imageA.pixels)
      const outputSum = sumPixels(result.pixels)
      
      // Total energy should be preserved (within tolerance)
      expect(Math.abs(outputSum - inputSum)).toBeLessThan(inputSum * 0.2)
    })
  })

  describe('Scenario C: Solo Override', () => {
    it('should only include soloed channel, ignoring other weights', async () => {
      const imageA = createConstantImage('A', 4, 100)
      const imageB = createConstantImage('B', 4, 200)

      // Both have weight 1.0, but A is soloed
      const channelA = createChannel('A', 1.0, 1.0, { locked: true, solo: true })
      const channelB = createChannel('B', 1.0, 1.0, { locked: true, solo: false })
      const weights = createMixerWeights([channelA, channelB], 'mag-phase')

      const payload = createPayload([imageA, imageB], weights)
      const result = await runMixerJob('test-solo-override', payload)

      // Result should match Image A only (solo active)
      const expectedMean = meanPixelValue(imageA.pixels)
      const actualMean = meanPixelValue(result.pixels)

      // Should be close to A's value, not A+B
      expect(Math.abs(actualMean - expectedMean)).toBeLessThan(15)
    })

    it('should include multiple soloed channels', async () => {
      const imageA = createConstantImage('A', 4, 100)
      const imageB = createConstantImage('B', 4, 100)
      const imageC = createConstantImage('C', 4, 200) // Not soloed

      // A and B are soloed, C is not
      const channelA = createChannel('A', 1.0, 1.0, { locked: true, solo: true })
      const channelB = createChannel('B', 1.0, 1.0, { locked: true, solo: true })
      const channelC = createChannel('C', 1.0, 1.0, { locked: true, solo: false })
      const weights = createMixerWeights([channelA, channelB, channelC], 'mag-phase')

      const payload = createPayload([imageA, imageB, imageC], weights)
      const result = await runMixerJob('test-multi-solo', payload)

      // Result should be A + B (both soloed), C ignored
      // Mean should be around 100+100=200 scaled by IFFT
      const actualMean = meanPixelValue(result.pixels)
      
      // Should not include C's contribution
      expect(actualMean).toBeLessThan(250) // If all 3 were included: 100+100+200=400 (clamped)
    })

    it('should ignore solo channel weights when all channels are unsoloed', async () => {
      const imageA = createConstantImage('A', 4, 100)
      const imageB = createConstantImage('B', 4, 100)

      // Neither is soloed - both should contribute
      const channelA = createChannel('A', 1.0, 1.0, { locked: true, solo: false })
      const channelB = createChannel('B', 1.0, 1.0, { locked: true, solo: false })
      const weights = createMixerWeights([channelA, channelB], 'mag-phase')

      const payload = createPayload([imageA, imageB], weights)
      const result = await runMixerJob('test-no-solo', payload)

      // Both should contribute: 100 + 100 = 200
      const actualMean = meanPixelValue(result.pixels)
      expect(actualMean).toBeGreaterThan(150) // Both contributing
    })
  })

  describe('Scenario D: Mute Silencer', () => {
    it('should produce zero output when single channel is muted', async () => {
      const imageA = createConstantImage('A', 4, 200)

      // Muted channel should contribute nothing
      const channelA = createChannel('A', 1.0, 1.0, { locked: true, muted: true })
      const weights = createMixerWeights([channelA], 'mag-phase')

      const payload = createPayload([imageA], weights)
      const result = await runMixerJob('test-mute-single', payload)

      // Output should be all zeros (or very close due to floating point)
      expect(isAllZeros(result.pixels, 2)).toBe(true)
    })

    it('should exclude muted channel from mix while keeping others', async () => {
      const imageA = createConstantImage('A', 4, 100) // Muted
      const imageB = createConstantImage('B', 4, 150) // Active

      const channelA = createChannel('A', 1.0, 1.0, { locked: true, muted: true })
      const channelB = createChannel('B', 1.0, 1.0, { locked: true, muted: false })
      const weights = createMixerWeights([channelA, channelB], 'mag-phase')

      const payload = createPayload([imageA, imageB], weights)
      const result = await runMixerJob('test-mute-partial', payload)

      // Result should match Image B only (A is muted)
      const expectedMean = meanPixelValue(imageB.pixels)
      const actualMean = meanPixelValue(result.pixels)

      expect(Math.abs(actualMean - expectedMean)).toBeLessThan(15)
    })

    it('should produce zero output when all channels are muted', async () => {
      const imageA = createConstantImage('A', 4, 100)
      const imageB = createConstantImage('B', 4, 200)

      const channelA = createChannel('A', 1.0, 1.0, { locked: true, muted: true })
      const channelB = createChannel('B', 1.0, 1.0, { locked: true, muted: true })
      const weights = createMixerWeights([channelA, channelB], 'mag-phase')

      const payload = createPayload([imageA, imageB], weights)
      const result = await runMixerJob('test-mute-all', payload)

      // All muted = zero output
      expect(isAllZeros(result.pixels, 2)).toBe(true)
    })

    it('should respect mute even when solo is active on same channel', async () => {
      const imageA = createConstantImage('A', 4, 200)

      // Edge case: both muted and soloed - mute should take precedence
      const channelA = createChannel('A', 1.0, 1.0, { locked: true, muted: true, solo: true })
      const weights = createMixerWeights([channelA], 'mag-phase')

      const payload = createPayload([imageA], weights)
      const result = await runMixerJob('test-mute-trumps-solo', payload)

      // Mute should win - output should be zero
      expect(isAllZeros(result.pixels, 2)).toBe(true)
    })
  })

  describe('Edge Cases & Numerical Stability', () => {
    it('should handle zero weights gracefully', async () => {
      const imageA = createConstantImage('A', 4, 200)

      const channelA = createChannel('A', 0.0, 0.0, { locked: true })
      const weights = createMixerWeights([channelA], 'mag-phase')

      const payload = createPayload([imageA], weights)
      const result = await runMixerJob('test-zero-weights', payload)

      // Zero weights = zero output
      expect(isAllZeros(result.pixels, 2)).toBe(true)
    })

    it('should handle negative weights (phase inversion)', async () => {
      const imageA = createConstantImage('A', 4, 100)
      const imageB = createConstantImage('B', 4, 100)

      // A has positive weight, B has negative (phase inverted)
      const channelA = createChannel('A', 1.0, 1.0, { locked: true })
      const channelB = createChannel('B', -1.0, 1.0, { locked: true })
      const weights = createMixerWeights([channelA, channelB], 'mag-phase')

      const payload = createPayload([imageA, imageB], weights)
      const result = await runMixerJob('test-negative-weights', payload)

      // Negative magnitude should cancel out positive
      // Result should be close to zero or very low
      const actualMean = meanPixelValue(result.pixels)
      expect(actualMean).toBeLessThan(50)
    })

    it('should preserve energy conservation with fractional weights', async () => {
      const imageA = createConstantImage('A', 4, 200)

      // 0.5 weight should approximately halve the output
      const channelA = createChannel('A', 0.5, 0.5, { locked: true })
      const weights = createMixerWeights([channelA], 'mag-phase')

      const payload = createPayload([imageA], weights)
      const result = await runMixerJob('test-half-weight', payload)

      const inputMean = meanPixelValue(imageA.pixels)
      const outputMean = meanPixelValue(result.pixels)

      // Should be roughly half
      expect(outputMean).toBeGreaterThan(inputMean * 0.3)
      expect(outputMean).toBeLessThan(inputMean * 0.7)
    })

    it('should handle empty channel array with legacy fallback', async () => {
      const imageA = createConstantImage('A', 4, 128)

      // Legacy mode: no channels array, just values
      const weights: MixerWeights = {
        values: [1, 1, 1, 1],
        locked: false,
        channels: [], // Empty - should trigger legacy fallback
        mode: 'mag-phase',
      }

      const payload = createPayload([imageA], weights)
      const result = await runMixerJob('test-legacy-fallback', payload)

      // Should still process with legacy values
      expect(result.pixels.length).toBe(16)
      expect(maxPixelValue(result.pixels)).toBeGreaterThan(50)
    })

    it('should handle large weight values with clamping', async () => {
      const imageA = createConstantImage('A', 4, 50)

      // Weight > 1 should amplify, but output is clamped to 255
      const channelA = createChannel('A', 3.0, 1.0, { locked: true })
      const weights = createMixerWeights([channelA], 'mag-phase')

      const payload = createPayload([imageA], weights)
      const result = await runMixerJob('test-amplify-clamp', payload)

      // Amplified but clamped
      const outputMean = meanPixelValue(result.pixels)
      expect(outputMean).toBeGreaterThan(50) // Amplified from 50
      expect(maxPixelValue(result.pixels)).toBeLessThanOrEqual(255) // Clamped
    })
  })

  describe('Linear Mixing Verification', () => {
    it('should satisfy superposition: mix(A+B) = mix(A) + mix(B)', async () => {
      const imageA = createConstantImage('A', 4, 60)
      const imageB = createConstantImage('B', 4, 40)

      // Mix A alone
      const channelA_only = createChannel('A', 1.0, 1.0, { locked: true })
      const weightsA = createMixerWeights([channelA_only], 'real-imag')
      const payloadA = createPayload([imageA], weightsA)
      const resultA = await runMixerJob('test-linear-A', payloadA)

      // Mix B alone
      const channelB_only = createChannel('B', 1.0, 1.0, { locked: true })
      const weightsB = createMixerWeights([channelB_only], 'real-imag')
      const payloadB = createPayload([imageB], weightsB)
      const resultB = await runMixerJob('test-linear-B', payloadB)

      // Mix A + B together
      const channelA_both = createChannel('A', 1.0, 1.0, { locked: true })
      const channelB_both = createChannel('B', 1.0, 1.0, { locked: true })
      const weightsBoth = createMixerWeights([channelA_both, channelB_both], 'real-imag')
      const payloadBoth = createPayload([imageA, imageB], weightsBoth)
      const resultBoth = await runMixerJob('test-linear-both', payloadBoth)

      // Superposition: sum(A) + sum(B) ≈ sum(A+B)
      const sumA = sumPixels(resultA.pixels)
      const sumB = sumPixels(resultB.pixels)
      const sumBoth = sumPixels(resultBoth.pixels)

      // Allow 10% tolerance for numerical errors
      const expectedSum = sumA + sumB
      const tolerance = expectedSum * 0.1
      expect(Math.abs(sumBoth - expectedSum)).toBeLessThan(tolerance)
    })

    it('should satisfy scaling: mix(k*A) = k * mix(A)', async () => {
      const imageA = createConstantImage('A', 4, 100)
      const scaleFactor = 0.5

      // Mix A with weight 1
      const channelA_full = createChannel('A', 1.0, 1.0, { locked: true })
      const weightsFull = createMixerWeights([channelA_full], 'real-imag')
      const payloadFull = createPayload([imageA], weightsFull)
      const resultFull = await runMixerJob('test-scale-full', payloadFull)

      // Mix A with weight 0.5
      const channelA_half = createChannel('A', scaleFactor, scaleFactor, { locked: true })
      const weightsHalf = createMixerWeights([channelA_half], 'real-imag')
      const payloadHalf = createPayload([imageA], weightsHalf)
      const resultHalf = await runMixerJob('test-scale-half', payloadHalf)

      // k * mix(A) should equal mix(k*A)
      const sumFull = sumPixels(resultFull.pixels)
      const sumHalf = sumPixels(resultHalf.pixels)
      const expected = sumFull * scaleFactor

      // Allow 15% tolerance
      const tolerance = expected * 0.15
      expect(Math.abs(sumHalf - expected)).toBeLessThan(tolerance)
    })
  })
})
