import { beforeEach, describe, expect, test, vi } from 'vitest'

const { loadRoutePageCommunityNotesMock } = vi.hoisted(() => ({
  loadRoutePageCommunityNotesMock: vi.fn(),
}))

vi.mock('@/features/image-first/server/load-route-page-community-notes', () => ({
  loadRoutePageCommunityNotes: loadRoutePageCommunityNotesMock,
}))

import { GET } from '@/app/api/image-first/community-notes/route'

describe('image-first community notes route', () => {
  beforeEach(() => {
    loadRoutePageCommunityNotesMock.mockReset()
  })

  test('loads notes with the supplied effective climb ID', async () => {
    loadRoutePageCommunityNotesMock.mockResolvedValue([])

    const response = await GET(new Request('https://letsboulder.com/api/image-first/community-notes?effectiveClimbId=canonical-climb'))

    expect(response.status).toBe(200)
    expect(loadRoutePageCommunityNotesMock).toHaveBeenCalledWith('canonical-climb')
  })

  test('rejects requests without an effective climb ID', async () => {
    const response = await GET(new Request('https://letsboulder.com/api/image-first/community-notes'))

    expect(response.status).toBe(400)
    expect(loadRoutePageCommunityNotesMock).not.toHaveBeenCalled()
  })
})
