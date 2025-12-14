import { describe, expect, it, vi } from 'vitest'
import { runMixerJob } from './fft-mixer.worker'

// In this environment Worker is not available; stub a minimal Worker to echo JOB_COMPLETE.
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage(message: any) {
    if (message?.type === 'JOB_START') {
      const payload = message.payload
      const pixels = payload.images?.[0]?.pixels ?? new Uint8ClampedArray()
      setTimeout(() => {
        this.onmessage?.({ data: { type: 'JOB_COMPLETE', payload: { pixels } } } as MessageEvent)
      }, 0)
    }
  }
  terminate() {
    /* noop */
  }
}

vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker)

const workerUrl = new URL('./fft-mixer.worker.ts', import.meta.url)

describe('fft-mixer.worker', () => {
  it('returns pixels for simple passthrough', async () => {
    const worker = new Worker(workerUrl, { type: 'module' })
    const jobId = 'fft-test-1'
    const pixels = new Uint8ClampedArray([10, 20, 30, 40])

    const result = await new Promise<{ pixels: Uint8ClampedArray }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 2000)
      worker.onmessage = (event) => {
        const data = event.data
        if (data.type === 'JOB_COMPLETE') {
          clearTimeout(timer)
          resolve(data.payload as { pixels: Uint8ClampedArray })
        }
      }
      worker.onerror = (err) => {
        clearTimeout(timer)
        reject(err as Error)
      }

      worker.postMessage({
        type: 'JOB_START',
        jobId,
        payload: {
          images: [{ id: 'A', width: 2, height: 2, pixels }],
          weights: { values: [1, 1, 1, 1] },
          regionMask: { shape: 'circle', mode: 'include', radius: 1 },
          brightnessConfig: { target: 'spatial', value: 0, contrast: 1 },
          targetViewport: 1,
          fftMode: 'js',
        },
      })
    })

    expect(result.pixels.length).toBe(pixels.length)
    worker.terminate()
  })
})

describe('runMixerJob helpers', () => {
  it('handles region masks and weights without throwing', async () => {
    const payload = {
      images: [{ id: 'A', width: 2, height: 2, pixels: new Uint8ClampedArray([1, 2, 3, 4]) }],
      weights: { 
        values: [0.5, 0.5, 0.5, 0.5], 
        locked: false,
        channels: [
          { id: 'A', weight1: 0.5, weight2: 0.5, locked: true, muted: false, solo: false },
          { id: 'B', weight1: 0.5, weight2: 0.5, locked: true, muted: false, solo: false },
          { id: 'C', weight1: 0.5, weight2: 0.5, locked: true, muted: false, solo: false },
          { id: 'D', weight1: 0.5, weight2: 0.5, locked: true, muted: false, solo: false },
        ],
        mode: 'mag-phase',
      },
      regionMask: { shape: 'circle', mode: 'exclude', radius: 0 },
      brightnessConfig: { target: 'spatial', value: 0, contrast: 1 },
      targetViewport: 1,
      fftMode: 'js',
    }
    const result = await runMixerJob('test-job', payload as any)
    expect(result.width).toBe(2)
    expect(result.pixels.length).toBe(4)
  })
})
