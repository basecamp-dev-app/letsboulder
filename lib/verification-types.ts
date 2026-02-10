import type { RoutePoint } from './useRouteSelection'

// =====================================================
// VERIFICATION TYPES
// =====================================================

export interface ClimbVerification {
  id: string
  climb_id: string
  user_id: string
  created_at: string
}

export interface GradeVote {
  id: string
  climb_id: string
  user_id: string
  grade: string
  created_at: string
}

export interface GradeVoteDistribution {
  grade: string
  vote_count: number
}

export type CorrectionType = 'location' | 'name' | 'line' | 'grade'
export type CorrectionStatus = 'pending' | 'approved' | 'rejected'
export type VoteType = 'approve' | 'reject'

export interface ClimbCorrection {
  id: string
  climb_id: string
  user_id: string
  correction_type: CorrectionType
  original_value: Record<string, unknown> | null
  suggested_value: Record<string, unknown>
  reason: string | null
  status: CorrectionStatus
  approval_count: number
  rejection_count: number
  created_at: string
  resolved_at: string | null
  // Populated fields
  user?: {
    id: string
    email: string
  }
}

export interface CorrectionVote {
  id: string
  correction_id: string
  user_id: string
  vote_type: VoteType
  created_at: string
}

// =====================================================
// CLIMB STATUS (extended)
// =====================================================

export interface ClimbWithVerification {
  id: string
  name: string | null
  grade: string
  status: string
  user_id: string | null
  is_verified: boolean
  verification_count: number
  user_has_verified: boolean
  user_is_submitter: boolean
  grade_votes: GradeVoteDistribution[]
  user_grade_vote: string | null
  corrections_count: number
  pending_corrections: number
}

// =====================================================
// IMAGE WITH VERIFICATION
// =====================================================

export interface ImageWithVerification {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  crag_id: string | null
  route_lines_count: number
  is_verified: boolean
  verification_count: number
}

// =====================================================
// CORRECTION SUBMISSION
// =====================================================

export interface CorrectionSubmission {
  correction_type: CorrectionType
  suggested_value: Record<string, unknown>
  reason?: string
}

// =====================================================
// API RESPONSES
// =====================================================

export interface ClimbStatusResponse {
  is_verified: boolean
  verification_count: number
  user_has_verified: boolean
  user_is_submitter: boolean
  grade_votes: GradeVoteDistribution[]
  user_grade_vote: string | null
  corrections: ClimbCorrection[]
}

export interface VerifyResponse {
  success: boolean
  is_verified: boolean
  verification_count: number
  message: string
}

export interface GradeVoteResponse {
  success: boolean
  vote_count: number
  consensus_grade: string | null
  message: string
}

export interface CorrectionResponse {
  success: boolean
  correction: ClimbCorrection
  message: string
}

export interface CorrectionVoteResponse {
  success: boolean
  approval_count: number
  rejection_count: number
  status: CorrectionStatus
  message: string
}

// =====================================================
// GRADE VOTING COMPONENT TYPES
// =====================================================

export interface GradeVotingProps {
  climbId: string
  currentGrade: string
  votes: GradeVoteDistribution[]
  userVote: string | null
  onVote: (grade: string) => void
  user?: { id: string } | null
  redirectTo?: string
}

// Grade vote scale: 1A..6A (no plus), then include plus from 6A+ onwards.
export const VALID_GRADES = [
  '1A', '1B', '1C',
  '2A', '2B', '2C',
  '3A', '3B', '3C',
  '4A', '4B', '4C',
  '5A', '5B', '5C',
  '6A',
  '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+',
  '9A', '9A+', '9B', '9B+', '9C', '9C+'
] as const

export type Grade = typeof VALID_GRADES[number]

export const MIN_SELECTABLE_GRADE: Grade = '3A'
export const SELECTABLE_GRADES = VALID_GRADES.slice(
  Math.max(0, VALID_GRADES.indexOf(MIN_SELECTABLE_GRADE))
) as readonly Grade[]

// =====================================================
// CORRECTION COMPONENT TYPES
// =====================================================

export interface CorrectionSectionProps {
  climbId: string
  corrections: ClimbCorrection[]
  onSubmitCorrection: (submission: CorrectionSubmission) => Promise<void>
  onVoteCorrection: (correctionId: string, voteType: VoteType) => Promise<void>
}

export interface CorrectionCardProps {
  correction: ClimbCorrection
  onVote: (voteType: VoteType) => void
  canVote: boolean
}

export interface CorrectionFormProps {
  correctionType: CorrectionType
  onSubmit: (submission: CorrectionSubmission) => Promise<void>
  onCancel: () => void
}

export interface LocationCorrectionValue {
  latitude: number
  longitude: number
}

export interface NameCorrectionValue {
  name: string
}

export interface LineCorrectionValue {
  points: RoutePoint[]
}

export interface GradeCorrectionValue {
  grade: string
}
