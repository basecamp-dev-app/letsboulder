import { Buffer } from 'buffer'

const IMAGE_SIGNATURES: Record<string, Uint8Array> = {
  'image/jpeg': new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]),
  'image/png': new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  'image/gif': new Uint8Array([0x47, 0x49, 0x46, 0x38]),
  'image/webp': new Uint8Array([0x52, 0x49, 0x46, 0x46]),
}

const MIN_SIGNATURE_LENGTH = Math.max(...Object.values(IMAGE_SIGNATURES).map(sig => sig.length))

export interface ValidationResult {
  valid: boolean
  mimeType?: string
  error?: string
}

export function validateImageSignature(buffer: Buffer): ValidationResult {
  if (buffer.length < MIN_SIGNATURE_LENGTH) {
    return { valid: false, error: 'File is too small to be a valid image' }
  }

  for (const [mimeType, signature] of Object.entries(IMAGE_SIGNATURES)) {
    let matches = true
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        matches = false
        break
      }
    }
    if (matches) {
      return { valid: true, mimeType }
    }
  }

  return { valid: false, error: 'Invalid or unsupported image format. Allowed formats: JPEG, PNG, GIF, WebP' }
}
