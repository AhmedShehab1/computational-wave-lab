import { describe, expect, it, beforeEach } from 'vitest'
import { useGlobalStore } from './globalStore'

describe('snapshot cap', () => {
  beforeEach(() => {
    useGlobalStore.setState({ snapshots: [] })
  })

  it('caps snapshots at 10, evicting oldest', () => {
    const dummyImage = { width: 2, height: 2, pixels: new Uint8ClampedArray([1, 2, 3, 4]) }
    for (let i = 0; i < 12; i += 1) {
      useGlobalStore.getState().addSnapshot(1, dummyImage)
    }
    const snaps = useGlobalStore.getState().snapshots
    expect(snaps.length).toBe(10)
    // ensure oldest is evicted by checking creation order monotonic
    const times = snaps.map((s) => s.createdAt)
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1])
    }
  })
})
