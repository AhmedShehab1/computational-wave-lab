import { describe, expect, it } from 'vitest'
import { computeRowSpectrum } from './spectrum'

describe('computeRowSpectrum', () => {
  it('returns magnitude array matching width', () => {
    const width = 4
    const height = 2
    const pixels = new Uint8ClampedArray([
      1, 2, 3, 4,
      4, 3, 2, 1,
    ])
    const spectrum = computeRowSpectrum(pixels, width, height)
    expect(spectrum.length).toBe(width)
    expect(spectrum.some((v) => Number.isNaN(v))).toBe(false)
  })
})
