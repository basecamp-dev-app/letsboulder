import { describe, expect, test } from 'vitest'
import { groupSubmittedImages } from '@/features/submissions/lib/group-submitted-images'

describe('groupSubmittedImages', () => {
  test('preserves route-bearing image metadata for multi-image submissions', () => {
    const result = groupSubmittedImages([
      {
        id: 'canonical-image',
        url: 'https://example.com/canonical.jpg',
        created_at: '2026-04-08T10:00:00Z',
        submission_id: 'submission-1',
        moderation_status: 'approved',
        is_anonymous_submission: false,
        contribution_credit_platform: null,
        contribution_credit_handle: null,
        crags: { name: 'Test Crag' },
        route_lines: [],
      },
      {
        id: 'face-image',
        url: 'https://example.com/face.jpg',
        created_at: '2026-04-08T10:05:00Z',
        submission_id: 'submission-1',
        moderation_status: 'approved',
        is_anonymous_submission: false,
        contribution_credit_platform: null,
        contribution_credit_handle: null,
        crags: { name: 'Test Crag' },
        route_lines: [{ id: 'route-line-1', climb_id: 'climb-1' }],
      },
    ], [])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      canonical_image_id: 'canonical-image',
      route_image_id: 'face-image',
      route_line_id: 'route-line-1',
      climb_id: 'climb-1',
      route_lines_count: 1,
    })
  })
})
