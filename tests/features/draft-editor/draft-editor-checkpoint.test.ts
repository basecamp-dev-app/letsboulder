import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canRestoreDraftEditorCheckpoint,
  clearDraftEditorCheckpoint,
  readDraftEditorCheckpoint,
  writeDraftEditorCheckpoint,
} from '@/features/draft-editor/lib/draft-editor-checkpoint'
import type { DraftEditorCheckpoint } from '@/features/draft-editor/lib/draft-editor-checkpoint'

const values = new Map<string, unknown>()
const mockDel = vi.fn(async (key: string) => { values.delete(key) })
const mockGet = vi.fn(async (key: string) => values.get(key))
const mockSet = vi.fn(async (key: string, value: unknown) => { values.set(key, value) })

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({ name: 'checkpoint-store' })),
  del: (...args: Parameters<typeof mockDel>) => mockDel(...args),
  get: (...args: Parameters<typeof mockGet>) => mockGet(...args),
  set: (...args: Parameters<typeof mockSet>) => mockSet(...args),
}))

function checkpoint(revision = 1): DraftEditorCheckpoint {
  return {
    schemaVersion: 1,
    revision,
    serverUpdatedAt: '2026-07-29T10:00:00.000Z',
    sectorId: 'sector-1',
    routesByImageId: {
      'image-1': [{
        id: 'route-1',
        name: 'Local route',
        grade: '6A',
        points: [{ x: 0.25, y: 0.5 }],
        sequenceOrder: 0,
        imageWidth: 1200,
        imageHeight: 900,
      }],
    },
  }
}

describe('draft editor checkpoints', () => {
  beforeEach(() => {
    values.clear()
    vi.clearAllMocks()
    vi.stubGlobal('indexedDB', {})
  })

  it('scopes checkpoints by authenticated user and draft', async () => {
    await writeDraftEditorCheckpoint('user-1', 'draft-1', checkpoint())

    await expect(readDraftEditorCheckpoint('user-1', 'draft-1')).resolves.toEqual(checkpoint())
    await expect(readDraftEditorCheckpoint('user-2', 'draft-1')).resolves.toBeNull()
    await expect(readDraftEditorCheckpoint('user-1', 'draft-2')).resolves.toBeNull()
  })

  it('removes checkpoint data with an unsupported schema', async () => {
    values.set('user-1:draft-1', { ...checkpoint(), schemaVersion: 2 })

    await expect(readDraftEditorCheckpoint('user-1', 'draft-1')).resolves.toBeNull()
    expect(mockDel).toHaveBeenCalledWith('user-1:draft-1', expect.anything())
  })

  it('only clears the revision that was successfully saved', async () => {
    values.set('user-1:draft-1', checkpoint(2))

    await clearDraftEditorCheckpoint('user-1', 'draft-1', 1)
    expect(values.has('user-1:draft-1')).toBe(true)

    await clearDraftEditorCheckpoint('user-1', 'draft-1', 2)
    expect(values.has('user-1:draft-1')).toBe(false)
  })

  it('does not restore over a newer collaborator revision', () => {
    expect(canRestoreDraftEditorCheckpoint(checkpoint(), {
      updatedAt: '2026-07-29T11:00:00.000Z',
      lastEditedBy: 'collaborator-2',
    }, 'user-1')).toBe(false)
    expect(canRestoreDraftEditorCheckpoint(checkpoint(), {
      updatedAt: '2026-07-29T11:00:00.000Z',
      lastEditedBy: 'user-1',
    }, 'user-1')).toBe(true)
  })

  it('silently degrades when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)

    await expect(readDraftEditorCheckpoint('user-1', 'draft-1')).resolves.toBeNull()
    await expect(writeDraftEditorCheckpoint('user-1', 'draft-1', checkpoint())).resolves.toBeUndefined()
    expect(mockGet).not.toHaveBeenCalled()
    expect(mockSet).not.toHaveBeenCalled()
  })
})
