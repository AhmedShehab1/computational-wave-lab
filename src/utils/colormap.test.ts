import { describe, expect, it } from 'vitest'
import { mapHeatmapToImageData, viridis } from './colormap'

describe('colormap', () => {
  it('maps normalized values to rgb without NaN', () => {
    const heatmap = new Float32Array([0, 0.5, 1])
    const pixels = mapHeatmapToImageData(heatmap, 3, 1)
    expect(pixels.length).toBe(12)
    for (const v of pixels) {
      expect(Number.isNaN(v)).toBe(false)
    }
  })

  it('viridis clamps input range', () => {
    const low = viridis(-1)
    const high = viridis(2)
    expect(low.every((n) => n >= 0 && n <= 255)).toBe(true)
    expect(high.every((n) => n >= 0 && n <= 255)).toBe(true)
  })
})
