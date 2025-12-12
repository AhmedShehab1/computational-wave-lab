import { describe, expect, it } from 'vitest'
import { buildResult } from './beam-sim.worker'
import type { BeamJobPayload } from '@/types'

const basePayload: BeamJobPayload = {
  arrays: [
    { id: 'a1', config: { frequencies: [2.4e9], bandwidth: 20e6 }, position: { x: 0, y: 0 } },
    { id: 'a2', config: { frequencies: [2.5e9], bandwidth: 15e6 }, position: { x: 0.2, y: -0.1 } },
  ],
  steering: { theta: 10, phi: -15 },
  renderMode: 'interference',
  widebandMode: 'aggregated',
  resolution: 64,
}

describe('beam-sim worker', () => {
  it('produces a heatmap with expected dimensions', () => {
    const result = buildResult(basePayload)
    expect(result.width).toBe(basePayload.resolution)
    expect(result.height).toBe(basePayload.resolution)
    expect(result.heatmap).toBeDefined()
    expect(result.heatmap?.length).toBe(basePayload.resolution * basePayload.resolution)
  })

  it('renders array geometry when requested', () => {
    const geometryResult = buildResult({ ...basePayload, renderMode: 'array-geometry' })
    expect(geometryResult.geometry).toBeDefined()
    expect(geometryResult.heatmap?.length).toBe(basePayload.resolution * basePayload.resolution)
  })

  it('normalizes delay-and-sum power to [0,1]', () => {
    const result = buildResult(basePayload)
    const max = Math.max(...Array.from(result.heatmap ?? []))
    expect(max).toBeGreaterThan(0)
    expect(max).toBeLessThanOrEqual(1)
  })

  it('supports cancellation hook', () => {
    let called = false
    const result = buildResult(basePayload, () => {
      called = true
      return true
    })
    expect(called).toBe(true)
    const sum = (result.heatmap ?? []).reduce((acc, v) => acc + v, 0)
    expect(sum).toBeLessThanOrEqual(basePayload.resolution * basePayload.resolution)
  })
})
