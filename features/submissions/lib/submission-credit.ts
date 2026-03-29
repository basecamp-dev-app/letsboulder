export const SUBMISSION_CREDIT_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'x', 'other'] as const

export type SubmissionCreditPlatform = (typeof SUBMISSION_CREDIT_PLATFORMS)[number]

const HANDLE_ALLOWED_PATTERN = /^[A-Za-z0-9._-]+$/
const MAX_HANDLE_LENGTH = 50

export function normalizeSubmissionCreditPlatform(value: unknown): SubmissionCreditPlatform | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (!SUBMISSION_CREDIT_PLATFORMS.includes(normalized as SubmissionCreditPlatform)) return null
  return normalized as SubmissionCreditPlatform
}

export function normalizeSubmissionCreditHandle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const withoutAt = trimmed.replace(/^@+/, '')
  if (!withoutAt) return null
  if (withoutAt.length > MAX_HANDLE_LENGTH) return null
  if (!HANDLE_ALLOWED_PATTERN.test(withoutAt)) return null

  return withoutAt
}

export function formatSubmissionCreditHandle(handle: string | null | undefined): string | null {
  if (!handle) return null
  const normalized = handle.replace(/^@+/, '').trim()
  if (!normalized) return null
  return `@${normalized}`
}
