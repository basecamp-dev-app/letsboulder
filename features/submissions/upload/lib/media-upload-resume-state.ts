export interface MediaUploadResumeState {
  visibilityState: DocumentVisibilityState
  isPaused: boolean
  activeClientId: string | null
  queueLength: number
}

export function shouldResumeQueuedUploads({ visibilityState, isPaused, activeClientId, queueLength }: MediaUploadResumeState) {
  return visibilityState === 'visible' && !isPaused && !activeClientId && queueLength > 0
}
