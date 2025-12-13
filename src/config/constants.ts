export const SNAPSHOT_CAP = 10

export const HEATMAP_RESOLUTION = {
  high: 256,
  low: 128,
} as const

export const TELEMETRY_SAMPLE = {
  error: 1.0,
  success: 0.05,
} as const

export const IMAGE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  mimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/tiff'],
  /**
   * Maximum dimension (width or height) for any loaded image.
   * Images larger than this are pre-emptively downscaled to prevent memory exhaustion.
   * 
   * Memory calculation:
   * - A 3024×4032 image = 12.2M pixels
   * - FFT requires Real + Imag (Float64): 12.2M × 2 × 8 bytes ≈ 200MB per image
   * - With 4 images + matrix operations: potential GBs of RAM → browser crash
   * 
   * Safe limits:
   * - 1024: ~1MP, ~16MB per image FFT data (recommended for most devices)
   * - 2048: ~4MP, ~64MB per image FFT data (high-memory devices only)
   */
  maxDimension: 1024,
} as const
