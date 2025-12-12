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
} as const
