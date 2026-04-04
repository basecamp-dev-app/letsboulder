import { describe, expect, test } from 'vitest'
import { getResponseError } from '@/lib/response-error'

describe('Admin Crags - Utility Functions', () => {
  describe('getResponseError', () => {
    test('extracts error string from payload', () => {
      const payload = { error: 'Something went wrong' }
      expect(getResponseError(payload, 'Fallback')).toBe('Something went wrong')
    })

    test('extracts error string from payload (preserves whitespace)', () => {
      const payload = { error: '  Trimmed error message  ' }
      expect(getResponseError(payload, 'Fallback')).toBe('  Trimmed error message  ')
    })

    test('returns fallback for empty error string', () => {
      const payload = { error: '' }
      expect(getResponseError(payload, 'Fallback')).toBe('Fallback')
    })

    test('returns fallback for non-object payload', () => {
      expect(getResponseError(null, 'Fallback')).toBe('Fallback')
      expect(getResponseError('string', 'Fallback')).toBe('Fallback')
      expect(getResponseError(123, 'Fallback')).toBe('Fallback')
    })

    test('returns fallback when error property missing', () => {
      const payload = { message: 'Some message' }
      expect(getResponseError(payload, 'Fallback')).toBe('Fallback')
    })

    test('returns fallback when error is not a string', () => {
      const payload = { error: { nested: true } }
      expect(getResponseError(payload, 'Fallback')).toBe('Fallback')
    })
  })

  describe('Delete confirmation validation', () => {
    function validateDeleteConfirmation(confirmCount: string, climbCount: number): { valid: boolean; error?: string } {
      if (confirmCount !== String(climbCount)) {
        return { valid: false, error: 'Type the climb count exactly to confirm' }
      }
      return { valid: true }
    }

    test('accepts matching climb count', () => {
      const result = validateDeleteConfirmation('42', 42)
      expect(result.valid).toBe(true)
    })

    test('rejects non-matching climb count', () => {
      const result = validateDeleteConfirmation('10', 42)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Type the climb count exactly to confirm')
    })

    test('rejects empty confirmation', () => {
      const result = validateDeleteConfirmation('', 42)
      expect(result.valid).toBe(false)
    })

    test('handles zero climb count', () => {
      const result = validateDeleteConfirmation('0', 0)
      expect(result.valid).toBe(true)
    })
  })
})
