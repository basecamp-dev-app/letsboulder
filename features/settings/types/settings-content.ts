import type { SubmissionCreditPlatform } from '@/features/submissions/public'
import type { GradeSystem } from '@/lib/grade-display'

export interface SettingsProfileFormData {
  avatarUrl: string
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
  summary: string
}

export interface GradeOption {
  value: GradeSystem
  label: string
  sample: string
}
