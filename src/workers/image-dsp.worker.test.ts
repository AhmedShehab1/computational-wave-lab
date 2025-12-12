import { describe, expect, it } from 'vitest'
import { toGrayscale } from './image-dsp.core'

describe('image-dsp.worker', () => {
  it('converts RGBA pixels to grayscale', () => {
    const width = 2
    const height = 1
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255, // red
      0, 255, 0, 255, // green
    ])

    const gray = toGrayscale(rgba, width, height)

    expect(Array.from(gray)).toEqual([76, 150])
  })
})
