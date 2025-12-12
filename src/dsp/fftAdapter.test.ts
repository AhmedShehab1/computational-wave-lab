import { describe, expect, it } from 'vitest'
import { createJsFftAdapter } from './fftAdapter'

const approxEqual = (a: Float32Array, b: Float32Array, eps = 1e-3) => {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i += 1) {
    expect(Math.abs(a[i] - b[i])).toBeLessThan(eps)
  }
}

describe('fftAdapter (js)', () => {
  it('round-trips a 1D signal via 2D pass', () => {
    const fft = createJsFftAdapter()
    const width = 4
    const height = 1
    const signal = new Float32Array([1, 2, 3, 4])
    const { re, im } = fft.fft2d(width, height, signal)
    const out = fft.ifft2d(width, height, re, im)
    approxEqual(out, signal)
  })

  it('preserves a DC pixel in 2D', () => {
    const fft = createJsFftAdapter()
    const width = 2
    const height = 2
    const signal = new Float32Array([1, 0, 0, 0])
    const { re, im } = fft.fft2d(width, height, signal)
    const out = fft.ifft2d(width, height, re, im)
    approxEqual(out, signal)
  })
})
