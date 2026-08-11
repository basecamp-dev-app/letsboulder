'use client'

import { logRoutesAction } from '@/features/logbook/public-actions'
import {
  getPendingMutations,
  markMutationFailed,
  markMutationSuccess,
  markMutationSyncing,
  resetSyncingMutations,
  type MutationOutboxRecord,
} from '@/features/offline/lib/mutation-outbox'

interface LogClimbMutationPayload {
  climbIds: string[]
  style: 'flash' | 'top' | 'try'
  notes?: string
  climbedOn: string
}

let replayPromise: Promise<void> | null = null

function isLogClimbPayload(payload: unknown): payload is LogClimbMutationPayload {
  if (!payload || typeof payload !== 'object') return false
  const candidate = payload as Partial<LogClimbMutationPayload>
  return Array.isArray(candidate.climbIds)
    && candidate.climbIds.every((climbId) => typeof climbId === 'string')
    && (candidate.style === 'flash' || candidate.style === 'top' || candidate.style === 'try')
    && typeof candidate.climbedOn === 'string'
}

async function replayOneMutation(record: MutationOutboxRecord): Promise<void> {
  if (record.operationType !== 'LOG_CLIMB' || !isLogClimbPayload(record.payload)) {
    await markMutationFailed(record.mutationId, new Error('Unsupported offline mutation'))
    return
  }

  await markMutationSyncing(record.mutationId)
  const result = await logRoutesAction(
    record.payload.climbIds,
    record.payload.style,
    record.payload.notes,
    record.payload.climbedOn,
    record.mutationId,
    record.createdAt,
  )
  if (!result.success) throw new Error(result.error)
  await markMutationSuccess(record.mutationId)
}

export function replayPendingMutations(userId?: string): Promise<void> {
  if (replayPromise) return replayPromise
  replayPromise = (async () => {
    await resetSyncingMutations()
    const records = await getPendingMutations(userId)
    for (const record of records) {
      try {
        await replayOneMutation(record)
      } catch (error) {
        await markMutationFailed(record.mutationId, error)
        break
      }
    }
  })().finally(() => {
    replayPromise = null
  })
  return replayPromise
}
