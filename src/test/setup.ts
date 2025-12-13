/* eslint-disable @typescript-eslint/no-unused-vars */
/// <reference types="vitest/globals" />

import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { mockCreateImageBitmap, mockOffscreenCanvas, MockWorker } from './mocks/browserAPIs'

// Cleanup after each test
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ============================================================================
// Mock ImageData (not available in jsdom)
// ============================================================================

class MockImageData {
  width: number
  height: number
  data: Uint8ClampedArray
  colorSpace: PredefinedColorSpace = 'srgb'

  constructor(sw: number, sh: number)
  constructor(data: Uint8ClampedArray, sw: number, sh?: number)
  constructor(swOrData: number | Uint8ClampedArray, shOrSw: number, maybeHeight?: number) {
    if (swOrData instanceof Uint8ClampedArray) {
      this.data = swOrData
      this.width = shOrSw
      this.height = maybeHeight ?? Math.floor(swOrData.length / (shOrSw * 4))
    } else {
      this.width = swOrData
      this.height = shOrSw
      this.data = new Uint8ClampedArray(this.width * this.height * 4)
    }
  }
}

vi.stubGlobal('ImageData', MockImageData)

// ============================================================================
// Mock HTMLCanvasElement.getContext
// ============================================================================

class MockCanvasRenderingContext2D {
  canvas: HTMLCanvasElement
  private imageDataStore: Map<string, ImageData> = new Map()
  willReadFrequently = false
  imageSmoothingEnabled = true
  imageSmoothingQuality: ImageSmoothingQuality = 'low'
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000'
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000000'
  lineWidth = 1
  lineCap: CanvasLineCap = 'butt'
  lineJoin: CanvasLineJoin = 'miter'
  font = '10px sans-serif'
  textAlign: CanvasTextAlign = 'start'
  textBaseline: CanvasTextBaseline = 'alphabetic'
  globalAlpha = 1
  globalCompositeOperation: GlobalCompositeOperation = 'source-over'
  shadowBlur = 0
  shadowColor = 'rgba(0, 0, 0, 0)'
  shadowOffsetX = 0
  shadowOffsetY = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData {
    const data = new Uint8ClampedArray(sw * sh * 4)
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4
        const gray = Math.floor(((x + y) / (sw + sh)) * 255)
        data[i] = gray
        data[i + 1] = gray
        data[i + 2] = gray
        data[i + 3] = 255
      }
    }
    return new MockImageData(data, sw, sh) as ImageData
  }

  putImageData(imageData: ImageData, dx: number, dy: number): void {
    this.imageDataStore.set(`${dx},${dy}`, imageData)
  }

  drawImage(..._args: unknown[]): void {}
  clearRect(x: number, y: number, w: number, h: number): void {}
  fillRect(x: number, y: number, w: number, h: number): void {}
  strokeRect(x: number, y: number, w: number, h: number): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(x: number, y: number): void {}
  lineTo(x: number, y: number): void {}
  arc(x: number, y: number, r: number, sAngle: number, eAngle: number): void {}
  fill(): void {}
  stroke(): void {}
  save(): void {}
  restore(): void {}
  scale(x: number, y: number): void {}
  translate(x: number, y: number): void {}
  rotate(angle: number): void {}
  setTransform(..._args: unknown[]): void {}
  resetTransform(): void {}
  clip(): void {}
  rect(x: number, y: number, w: number, h: number): void {}
  fillText(text: string, x: number, y: number): void {}
  strokeText(text: string, x: number, y: number): void {}
  measureText(text: string): TextMetrics {
    return { width: text.length * 8 } as TextMetrics
  }
  setLineDash(segments: number[]): void {}
  getLineDash(): number[] { return [] }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    return {
      addColorStop: () => {},
    } as CanvasGradient
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient {
    return {
      addColorStop: () => {},
    } as CanvasGradient
  }
  createPattern(image: CanvasImageSource, repetition: string | null): CanvasPattern | null {
    return {} as CanvasPattern
  }
}

// Override HTMLCanvasElement prototype
const originalGetContext = HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = function(
  contextId: string,
  options?: CanvasRenderingContext2DSettings
): RenderingContext | null {
  if (contextId === '2d') {
    const ctx = new MockCanvasRenderingContext2D(this)
    if (options?.willReadFrequently !== undefined) {
      ctx.willReadFrequently = options.willReadFrequently
    }
    return ctx as unknown as CanvasRenderingContext2D
  }
  return originalGetContext.call(this, contextId, options)
}

// ============================================================================
// Global Browser API Mocks
// ============================================================================

// Mock Worker API
vi.stubGlobal('Worker', MockWorker)

// Mock OffscreenCanvas
vi.stubGlobal('OffscreenCanvas', mockOffscreenCanvas)

// Mock createImageBitmap
vi.stubGlobal('createImageBitmap', mockCreateImageBitmap)

// ============================================================================
// Global Browser API Mocks
// ============================================================================

// Mock Worker API
vi.stubGlobal('Worker', MockWorker)

// Mock OffscreenCanvas
vi.stubGlobal('OffscreenCanvas', mockOffscreenCanvas)

// Mock createImageBitmap
vi.stubGlobal('createImageBitmap', mockCreateImageBitmap)

// Mock URL.createObjectURL and revokeObjectURL
const originalURL = globalThis.URL
class MockURL extends originalURL {
  constructor(url: string | URL, base?: string | URL) {
    // Handle import.meta.url style URLs
    if (typeof url === 'string' && url.startsWith('./')) {
      super('blob:mock-worker-url')
      return
    }
    super(url, base)
  }
}

vi.stubGlobal('URL', Object.assign(MockURL, {
  createObjectURL: vi.fn(() => 'blob:mock-url'),
  revokeObjectURL: vi.fn(),
}))

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

// Mock requestAnimationFrame
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
  return setTimeout(() => callback(performance.now()), 16) as unknown as number
})

vi.stubGlobal('cancelAnimationFrame', (id: number) => {
  clearTimeout(id)
})

// Mock self.postMessage for worker tests (in jsdom, self === window)
const originalPostMessage = window.postMessage
window.postMessage = (message: unknown, targetOriginOrTransfer?: unknown, transfer?: Transferable[]) => {
  // If called without origin (like in workers), just ignore
  if (targetOriginOrTransfer === undefined || Array.isArray(targetOriginOrTransfer)) {
    return
  }
  // Otherwise, call the original
  originalPostMessage.call(window, message, targetOriginOrTransfer as string, transfer)
}

// Mock Image
class MockImage {
  width = 100
  height = 100
  src = ''
  onload: (() => void) | null = null
  onerror: ((error: Error) => void) | null = null
  
  constructor() {
    setTimeout(() => {
      if (this.onload) this.onload()
    }, 0)
  }
}
vi.stubGlobal('Image', MockImage)

// Console warning filter for expected warnings
const originalWarn = console.warn
console.warn = (...args: unknown[]) => {
  const message = args[0]
  if (typeof message === 'string') {
    // Filter out expected warnings during tests
    if (message.includes('React does not recognize')) return
    if (message.includes('Invalid value for prop')) return
  }
  originalWarn.apply(console, args)
}
