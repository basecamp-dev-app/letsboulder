import { describe, expect, test, vi, beforeEach } from 'vitest'
import { submitGymOwnerApplicationAction } from '@/features/gym-owners/actions'
import { getServerClient } from '@/lib/supabase-server'

vi.mock('@/lib/supabase-server', () => ({
  getServerClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'test-id', created_at: '2024-01-01', status: 'pending' }, error: null }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/discord', () => ({
  notifyGymOwnerApplication: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/turnstile', () => ({
  verifyTurnstile: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

describe('Gym Owner Application Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isValidEmail', () => {
    test.each([
      ['test@example.com', true],
      ['test.user@example.com', true],
      ['test@example.co.uk', true],
      ['invalid', false],
      ['invalid@', false],
      ['@example.com', false],
      ['', false],
      ['test@ example.com', false],
    ])('isValidEmail(%s) === %s', (input, expected) => {
      const emailRegex = /^\S+@\S+\.\S+$/
      expect(emailRegex.test(input)).toBe(expected)
    })
  })

  describe('submitGymOwnerApplicationAction', () => {
    test('rejects honeypot spam', async () => {
      const result = await submitGymOwnerApplicationAction({
        gym_name: 'Test Gym',
        address: '123 Main St',
        city: 'Test City',
        country: 'US',
        postcode_or_zip: '12345',
        contact_phone: '555-1234',
        contact_email: 'test@example.com',
        role: 'owner',
        facilities: ['sport'],
        website_url: 'http://spam.com',
        turnstileToken: 'valid-token',
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid submission')
    })

    test('rejects missing required fields', async () => {
      const result = await submitGymOwnerApplicationAction({ turnstileToken: 'valid-token' })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid input: expected string, received undefined')
    })

    test('rejects invalid email', async () => {
      const result = await submitGymOwnerApplicationAction({
        gym_name: 'Test Gym',
        address: '123 Main St',
        city: 'Test City',
        country: 'US',
        postcode_or_zip: '12345',
        contact_phone: '555-1234',
        contact_email: 'invalid-email',
        role: 'owner',
        facilities: ['sport'],
        turnstileToken: 'valid-token',
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Enter a valid email address.')
    })

    test('rejects invalid role', async () => {
      const result = await submitGymOwnerApplicationAction({
        gym_name: 'Test Gym',
        address: '123 Main St',
        city: 'Test City',
        country: 'US',
        postcode_or_zip: '12345',
        contact_phone: '555-1234',
        contact_email: 'test@example.com',
        role: 'invalid_role',
        facilities: ['sport'],
        turnstileToken: 'valid-token',
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Select a valid role.')
    })

    test('rejects empty facilities', async () => {
      const result = await submitGymOwnerApplicationAction({
        gym_name: 'Test Gym',
        address: '123 Main St',
        city: 'Test City',
        country: 'US',
        postcode_or_zip: '12345',
        contact_phone: '555-1234',
        contact_email: 'test@example.com',
        role: 'owner',
        facilities: [],
        turnstileToken: 'valid-token',
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Select at least one gym facility.')
    })

    test('rejects invalid facility', async () => {
      const result = await submitGymOwnerApplicationAction({
        gym_name: 'Test Gym',
        address: '123 Main St',
        city: 'Test City',
        country: 'US',
        postcode_or_zip: '12345',
        contact_phone: '555-1234',
        contact_email: 'test@example.com',
        role: 'owner',
        facilities: ['invalid_facility'],
        turnstileToken: 'valid-token',
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Select a valid gym facility.')
    })

    test('rejects comments over 2000 chars', async () => {
      const longComments = 'x'.repeat(2001)
      const result = await submitGymOwnerApplicationAction({
        gym_name: 'Test Gym',
        address: '123 Main St',
        city: 'Test City',
        country: 'US',
        postcode_or_zip: '12345',
        contact_phone: '555-1234',
        contact_email: 'test@example.com',
        role: 'owner',
        facilities: ['sport'],
        additional_comments: longComments,
        turnstileToken: 'valid-token',
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Additional comments must be 2,000 characters or less.')
    })

    test('accepts valid application', async () => {
      const result = await submitGymOwnerApplicationAction({
        gym_name: 'Test Gym',
        address: '123 Main St',
        city: 'Test City',
        country: 'US',
        postcode_or_zip: '12345',
        contact_phone: '555-1234',
        contact_email: 'test@example.com',
        role: 'owner',
        facilities: ['sport'],
        turnstileToken: 'valid-token',
      })
      expect(result.success).toBe(true)
    })

    test('returns a recoverable duplicate state for a uniqueness conflict', async () => {
      vi.mocked(getServerClient).mockResolvedValueOnce({
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } }),
            }),
          }),
        }),
      } as never)

      const result = await submitGymOwnerApplicationAction({
        gym_name: 'Test Gym',
        address: '123 Main St',
        city: 'Test City',
        country: 'US',
        postcode_or_zip: '12345',
        contact_phone: '555-1234',
        contact_email: 'test@example.com',
        role: 'owner',
        facilities: ['sport'],
        turnstileToken: 'valid-token',
      })

      expect(result).toMatchObject({ success: false, status: 409 })
      expect(result.error).toContain('already been received')
    })

    test('deduplicates facilities', async () => {
      const result = await submitGymOwnerApplicationAction({
        gym_name: 'Test Gym',
        address: '123 Main St',
        city: 'Test City',
        country: 'US',
        postcode_or_zip: '12345',
        contact_phone: '555-1234',
        contact_email: 'test@example.com',
        role: 'manager',
        facilities: ['sport', 'SPORT', 'boulder'],
        turnstileToken: 'valid-token',
      })
      expect(result.success).toBe(true)
    })

    test('accepts all valid roles', async () => {
      const roles = ['owner', 'manager', 'head_setter']
      for (const role of roles) {
        const result = await submitGymOwnerApplicationAction({
          gym_name: 'Test Gym',
          address: '123 Main St',
          city: 'Test City',
          country: 'US',
          postcode_or_zip: '12345',
          contact_phone: '555-1234',
          contact_email: 'test@example.com',
          role,
          facilities: ['sport'],
          turnstileToken: 'valid-token',
        })
        expect(result.success).toBe(true)
      }
    })

    test('accepts all valid facilities', async () => {
      const facilities = ['sport', 'boulder']
      for (const facility of facilities) {
        const result = await submitGymOwnerApplicationAction({
          gym_name: 'Test Gym',
          address: '123 Main St',
          city: 'Test City',
          country: 'US',
          postcode_or_zip: '12345',
          contact_phone: '555-1234',
          contact_email: 'test@example.com',
          role: 'owner',
          facilities: [facility],
          turnstileToken: 'valid-token',
        })
        expect(result.success).toBe(true)
      }
    })

    test('trims whitespace from inputs', async () => {
      const result = await submitGymOwnerApplicationAction({
        gym_name: '  Test Gym  ',
        address: '  123 Main St  ',
        city: '  Test City  ',
        country: '  US  ',
        postcode_or_zip: '  12345  ',
        contact_phone: '  555-1234  ',
        contact_email: '  TEST@EXAMPLE.COM  ',
        role: '  owner  ',
        facilities: [' sport '],
        turnstileToken: 'valid-token',
      })
      expect(result.success).toBe(true)
    })
  })
})
