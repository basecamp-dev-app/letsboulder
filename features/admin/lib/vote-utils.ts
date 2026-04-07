export interface VoteCountInput {
  verify_count: number
  flag_count: number
}

export interface VoteCountResult {
  newVerifyCount: number
  newFlagCount: number
  wasResolved: boolean
  resolutionStatus: 'verified' | 'flagged' | null
}

export function calculateVoteCounts(
  queueItem: VoteCountInput,
  vote_type: 'verify' | 'flag'
): VoteCountResult {
  const newVerifyCount = vote_type === 'verify' ? queueItem.verify_count + 1 : queueItem.verify_count
  const newFlagCount = vote_type === 'flag' ? queueItem.flag_count + 1 : queueItem.flag_count
  const wasResolved = newVerifyCount >= 3 || newFlagCount >= 3
  const resolutionStatus = newVerifyCount >= 3 ? 'verified' : newFlagCount >= 3 ? 'flagged' : null

  return {
    newVerifyCount,
    newFlagCount,
    wasResolved,
    resolutionStatus,
  }
}