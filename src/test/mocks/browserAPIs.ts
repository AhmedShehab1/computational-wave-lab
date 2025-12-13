/**
 * Mock implementations for browser APIs that are not available in jsdom
 * Used for testing image processing, canvas operations, and web workers
 */

import { vi } from 'vitest'

// ============================================================================
// MockImageBitmap
// ============================================================================

export interface MockImageBitmapOptions {
  width?: number
  height?: number
}

export class MockImageBitmap {
  width: number
  height: number
  closed = false

  constructor(width = 100, height = 100) {
    this.width = width
    this.height = height
  }

  close() {
    this.closed = true
  }
}

/**
 * Mock createImageBitmap that respects resize options
 * Simulates browser-native image loading and resizing
 */
export const mockCreateImageBitmap = vi.fn(
  async (
    source: ImageBitmapSource | File,
    options?: ImageBitmapOptions
  ): Promise<MockImageBitmap> => {
    let width = 100
    let height = 100

    // If source is a File, simulate reading dimensions
    if (source instanceof File) {
      // For testing, use file name to encode dimensions: "test_1024x768.jpg"
      const match = source.name.match(/(\d+)x(\d+)/)
      if (match) {
        width = parseInt(match[1], 10)
        height = parseInt(match[2], 10)
      }
    } else if ('width' in source && 'height' in source) {
      width = (source as { width: number; height: number }).width
      height = (source as { width: number; height: number }).height
    }

    // Apply resize options (simulates browser-native resizing)
    if (options?.resizeWidth && options?.resizeHeight) {
      width = options.resizeWidth
      height = options.resizeHeight
    } else if (options?.resizeWidth) {
      const scale = options.resizeWidth / width
      width = options.resizeWidth
      height = Math.round(height * scale)
    } else if (options?.resizeHeight) {
      const scale = options.resizeHeight / height
      height = options.resizeHeight
      width = Math.round(width * scale)
    }

    return new MockImageBitmap(width, height)
  }
)

// ============================================================================
// MockOffscreenCanvas
// ============================================================================

export class MockOffscreenCanvasContext2D {
  private imageDataStore: Map<string, ImageData> = new Map()
  willReadFrequently = false
  imageSmoothingEnabled = true
  imageSmoothingQuality: ImageSmoothingQuality = 'low'
  fillStyle = '#000000'
  strokeStyle = '#000000'
  
  constructor(private canvas: { width: number; height: number }) {}

  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData {
    // Return synthetic image data for testing
    const data = new Uint8ClampedArray(sw * sh * 4)
    // Fill with gray gradient for testable data
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4
        const gray = Math.floor(((x + y) / (sw + sh)) * 255)
        data[i] = gray     // R
        data[i + 1] = gray // G
        data[i + 2] = gray // B
        data[i + 3] = 255  // A
      }
    }
    return new ImageData(data, sw, sh)
  }

  putImageData(imageData: ImageData, dx: number, dy: number): void {
    this.imageDataStore.set(`${dx},${dy}`, imageData)
  }

  drawImage(
    image: CanvasImageSource,
    dx: number,
    dy: number,
    dw?: number,
    dh?: number
  ): void {
    // Mock implementation - just track that it was called
  }

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
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {}
  resetTransform(): void {}
}

export class mockOffscreenCanvas {
  width: number
  height: number
  private context: MockOffscreenCanvasContext2D | null = null

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  getContext(
    contextId: '2d',
    options?: CanvasRenderingContext2DSettings
  ): MockOffscreenCanvasContext2D | null {
    if (!this.context) {
      this.context = new MockOffscreenCanvasContext2D(this)
      if (options?.willReadFrequently !== undefined) {
        this.context.willReadFrequently = options.willReadFrequently
      }
    }
    return this.context
  }

  transferToImageBitmap(): MockImageBitmap {
    return new MockImageBitmap(this.width, this.height)
  }

  convertToBlob(options?: { type?: string; quality?: number }): Promise<Blob> {
    return Promise.resolve(new Blob(['mock'], { type: options?.type || 'image/png' }))
  }
}

// ============================================================================
// MockWorker
// ============================================================================

type WorkerMessageHandler = (event: MessageEvent) => void

export class MockWorker implements Worker {
  onmessage: WorkerMessageHandler | null = null
  onmessageerror: ((this: Worker, ev: MessageEvent) => void) | null = null
  onerror: ((this: AbstractWorker, ev: ErrorEvent) => void) | null = null
  
  private messageHandler: ((data: unknown) => void) | null = null
  private terminated = false

  constructor(scriptURL: string | URL, options?: WorkerOptions) {
    // In tests, we can intercept worker creation
  }

  postMessage(message: unknown, transfer?: Transferable[]): void
  postMessage(message: unknown, options?: StructuredSerializeOptions): void
  postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions): void {
    if (this.terminated) return
    
    // Simulate async processing
    setTimeout(() => {
      if (this.messageHandler) {
        this.messageHandler(message)
      }
    }, 0)
  }

  terminate(): void {
    this.terminated = true
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message' && typeof listener === 'function') {
      this.onmessage = listener as WorkerMessageHandler
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message' && this.onmessage === listener) {
      this.onmessage = null
    }
  }

  dispatchEvent(event: Event): boolean {
    return true
  }

  /**
   * Simulate receiving a message from the worker
   * Used in tests to mock worker responses
   */
  simulateResponse(data: unknown): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }))
    }
  }

  /**
   * Set a handler for messages sent to the worker
   * Used in tests to intercept postMessage calls
   */
  setMessageHandler(handler: (data: unknown) => void): void {
    this.messageHandler = handler
  }
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a mock File for testing image uploads
 */
export function createMockImageFile(
  name: string,
  width: number,
  height: number,
  type = 'image/png'
): File {
  // Encode dimensions in filename for mockCreateImageBitmap to parse
  const encodedName = `${name}_${width}x${height}.${type.split('/')[1]}`
  const content = new Uint8Array([0x89, 0x50, 0x4e, 0x47]) // PNG header
  return new File([content], encodedName, { type })
}

/**
 * Create mock grayscale data for testing
 */
export function createMockGrayscale(width: number, height: number, pattern: 'gradient' | 'checkerboard' | 'solid' = 'gradient'): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height)
  
  switch (pattern) {
    case 'gradient':
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          data[y * width + x] = Math.floor(((x + y) / (width + height - 2)) * 255)
        }
      }
      break
    case 'checkerboard':
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          data[y * width + x] = ((x + y) % 2) * 255
        }
      }
      break
    case 'solid':
      data.fill(128)
      break
  }
  
  return data
}

/**
 * Create mock RGBA image data for testing
 */
export function createMockRGBA(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const gray = Math.floor(Math.random() * 256)
    data[i * 4] = gray     // R
    data[i * 4 + 1] = gray // G  
    data[i * 4 + 2] = gray // B
    data[i * 4 + 3] = 255  // A
  }
  return data
}

/**
 * Wait for all pending promises to resolve
 */
export async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * Wait for a specific number of milliseconds
 */
export async function wait(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}
