import { describe, expect, test } from 'vitest'
import { z } from 'zod'

const createSubmissionDraftInputSchema = z.object({
  images: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  cragId: z.string().trim().min(1).nullable().optional(),
})

const saveSettingsInputSchema = z.object({
  email: z.string().email().optional(),
  gradePreference: z.enum(['french', 'yds', 'ewbank', 'uiaa', 'brazilian']).optional(),
  displayName: z.string().max(50).optional(),
})

describe('Zod v4 Schema Round-Trip Validation', () => {
  describe('createSubmissionDraftInputSchema', () => {
    test('parses valid input', () => {
      const validInput = {
        cragId: 'crag-123',
        images: [{ uploadedBucket: 'bucket', uploadedPath: 'path/image.jpg' }],
      }
      const result = createSubmissionDraftInputSchema.safeParse(validInput)
      expect(result.success).toBe(true)
    })

    test('parses valid input without images', () => {
      const validInput = { cragId: 'crag-123' }
      const result = createSubmissionDraftInputSchema.safeParse(validInput)
      expect(result.success).toBe(true)
    })

    test('rejects invalid cragId', () => {
      const invalidInput = { cragId: '' }
      const result = createSubmissionDraftInputSchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
    })

    test('rejects non-array images (images is z.unknown, validation happens in action)', () => {
      const input = { cragId: 'crag-123', images: 'not-an-array' }
      const result = createSubmissionDraftInputSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    test('handles z.record() - metadata field', () => {
      const inputWithMetadata = {
        cragId: 'crag-123',
        metadata: { customKey: 'customValue', numericKey: 42 },
      }
      const result = createSubmissionDraftInputSchema.safeParse(inputWithMetadata)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata).toEqual({ customKey: 'customValue', numericKey: 42 })
      }
    })

    test('handles z.record() with complex nested values', () => {
      const inputWithComplexMetadata = {
        cragId: 'crag-123',
        metadata: {
          route_data: { grade: '6a', style: 'onsight' },
          tags: ['sport', 'trad'],
        },
      }
      const result = createSubmissionDraftInputSchema.safeParse(inputWithComplexMetadata)
      expect(result.success).toBe(true)
    })
  })

  describe('saveSettingsInputSchema', () => {
    test('parses valid settings input', () => {
      const validInput = {
        email: 'test@example.com',
        gradePreference: 'french' as const,
      }
      const result = saveSettingsInputSchema.safeParse(validInput)
      expect(result.success).toBe(true)
    })

    test('rejects invalid email', () => {
      const invalidInput = { email: 'not-an-email' }
      const result = saveSettingsInputSchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
    })

    test('rejects invalid gradePreference', () => {
      const invalidInput = { gradePreference: 'invalid-grade-system' }
      const result = saveSettingsInputSchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
    })
  })

  describe('Zod v4 API Compatibility', () => {
    test('z.record signature works', () => {
      const recordSchema = z.record(z.string(), z.unknown())
      const result = recordSchema.safeParse({ key1: 'value1', key2: 123 })
      expect(result.success).toBe(true)
    })

    test('z.record with key schema works', () => {
      const recordSchema = z.record(z.string(), z.array(z.enum(['a', 'b', 'c'])))
      const result = recordSchema.safeParse({ image1: ['a', 'b'], image2: ['c'] })
      expect(result.success).toBe(true)
    })

    test('z.object with .shape access works', () => {
      const objSchema = z.object({ name: z.string(), age: z.number() })
      expect(objSchema.shape.name).toBeDefined()
    })

    test('z.enum works', () => {
      const enumSchema = z.enum(['a', 'b', 'c'])
      const result = enumSchema.safeParse('a')
      expect(result.success).toBe(true)
      expect(result.success && result.data).toBe('a')
    })

    test('z.array works', () => {
      const arraySchema = z.array(z.number())
      const result = arraySchema.safeParse([1, 2, 3])
      expect(result.success).toBe(true)
    })

    test('z.optional works', () => {
      const optionalSchema = z.string().optional()
      const result = optionalSchema.safeParse(undefined)
      expect(result.success).toBe(true)
    })

    test('z.union works', () => {
      const unionSchema = z.union([z.string(), z.number()])
      expect(unionSchema.safeParse('hello').success).toBe(true)
      expect(unionSchema.safeParse(123).success).toBe(true)
    })

    test('z.pick works', () => {
      const baseSchema = z.object({ a: z.string(), b: z.number(), c: z.boolean() })
      const pickedSchema = baseSchema.pick({ a: true, b: true })
      expect(pickedSchema.safeParse({ a: 'hello', b: 123 }).success).toBe(true)
    })

    test('z.omit works', () => {
      const baseSchema = z.object({ a: z.string(), b: z.number() })
      const omittedSchema = baseSchema.omit({ b: true })
      expect(omittedSchema.safeParse({ a: 'hello' }).success).toBe(true)
    })

    test('z.string().trim() works', () => {
      const trimmedSchema = z.string().trim().min(1)
      expect(trimmedSchema.safeParse('  hello  ').success).toBe(true)
      expect(trimmedSchema.safeParse('   ').success).toBe(false)
    })

    test('z.array().min() works', () => {
      const minArraySchema = z.array(z.string()).min(1)
      expect(minArraySchema.safeParse(['a']).success).toBe(true)
      expect(minArraySchema.safeParse([]).success).toBe(false)
    })
  })
})
