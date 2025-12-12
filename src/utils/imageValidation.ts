import { IMAGE_LIMITS } from '@/config/constants'

export interface ImageValidationResult {
  ok: boolean
  error?: string
}

export function validateImageFile(file: File): ImageValidationResult {
  if (!IMAGE_LIMITS.mimeTypes.includes(file.type)) {
    return { ok: false, error: 'Unsupported file type' }
  }
  if (file.size > IMAGE_LIMITS.maxBytes) {
    return { ok: false, error: 'File exceeds 10MB limit' }
  }
  return { ok: true }
}
