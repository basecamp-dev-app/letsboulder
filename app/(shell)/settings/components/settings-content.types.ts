import type { GradeSystem } from '@/lib/grade-display'
import type { SubmissionCreditPlatform } from '@/features/submissions/lib/submission-credit'

export interface SettingsProfileFormData {
  firstName: string
  lastName: string
  gender: string
  heightCm: string
  reachCm: string
  bio: string
  contributionCreditPlatform: SubmissionCreditPlatform
  contributionCreditHandle: string
}

export interface SettingsTab {
  id: string
  label: string
}

export interface GradeOption {
  value: GradeSystem
  label: string
  sample: string
}
