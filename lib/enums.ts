import { z } from 'zod'

export const ImageStatusEnum = z.enum(['pending', 'approved', 'rejected', 'deleted'])
export type ImageStatus = z.infer<typeof ImageStatusEnum>

export const ImageVisibilityEnum = z.enum(['private', 'public'])
export type ImageVisibility = z.infer<typeof ImageVisibilityEnum>

export const ImageProcessingStatusEnum = z.enum(['pending', 'queued', 'processing', 'ready', 'failed'])
export type ImageProcessingStatus = z.infer<typeof ImageProcessingStatusEnum>

export const ImageModerationStatusEnum = z.enum(['pending', 'approved', 'rejected'])
export type ImageModerationStatus = z.infer<typeof ImageModerationStatusEnum>

export const ImageLocationModeEnum = z.enum(['shared', 'custom'])
export type ImageLocationMode = z.infer<typeof ImageLocationModeEnum>

export const ImageStorageProviderEnum = z.enum(['r2', 'supabase'])
export type ImageStorageProvider = z.infer<typeof ImageStorageProviderEnum>

export const ClimbStatusEnum = z.enum(['pending', 'approved', 'rejected', 'active'])
export type ClimbStatus = z.infer<typeof ClimbStatusEnum>

export const ClimbRouteTypeEnum = z.enum(['sport', 'boulder', 'trad', 'deep-water-solo'])
export type ClimbRouteType = z.infer<typeof ClimbRouteTypeEnum>

export const CommunityPostTypeEnum = z.enum(['session', 'update', 'conditions', 'question'])
export type CommunityPostType = z.infer<typeof CommunityPostTypeEnum>

export const RsvpStatusEnum = z.enum(['going', 'interested'])
export type RsvpStatus = z.infer<typeof RsvpStatusEnum>

export const FlagStatusEnum = z.enum(['pending', 'resolved'])
export type FlagStatus = z.infer<typeof FlagStatusEnum>

export const FlagActionEnum = z.enum(['keep', 'edit', 'remove'])
export type FlagAction = z.infer<typeof FlagActionEnum>

export const CorrectionStatusEnum = z.enum(['pending', 'approved', 'rejected'])
export type CorrectionStatus = z.infer<typeof CorrectionStatusEnum>

export const VoteTypeEnum = z.enum(['approve', 'reject'])
export type VoteType = z.infer<typeof VoteTypeEnum>

export const CragReportStatusEnum = z.enum(['pending', 'investigating', 'resolved', 'dismissed'])
export type CragReportStatus = z.infer<typeof CragReportStatusEnum>

export const MediaJobStatusEnum = z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled'])
export type MediaJobStatus = z.infer<typeof MediaJobStatusEnum>

export const MediaJobTypeEnum = z.enum(['ingest_image'])
export type MediaJobType = z.infer<typeof MediaJobTypeEnum>

export const GymRouteStatusEnum = z.enum(['active', 'retired'])
export type GymRouteStatus = z.infer<typeof GymRouteStatusEnum>

export const GymRouteDisciplineEnum = z.enum(['boulder', 'sport', 'top_rope', 'mixed'])
export type GymRouteDiscipline = z.infer<typeof GymRouteDisciplineEnum>

export const GymMembershipStatusEnum = z.enum(['active', 'invited', 'revoked'])
export type GymMembershipStatus = z.infer<typeof GymMembershipStatusEnum>

export const GymMembershipRoleEnum = z.enum(['owner', 'manager', 'head_setter', 'setter'])
export type GymMembershipRole = z.infer<typeof GymMembershipRoleEnum>

export const GymApplicationStatusEnum = z.enum(['pending', 'reviewing', 'approved', 'rejected'])
export type GymApplicationStatus = z.infer<typeof GymApplicationStatusEnum>

export const PlaceTypeEnum = z.enum(['crag', 'gym'])
export type PlaceType = z.infer<typeof PlaceTypeEnum>

export const LocationTagKindEnum = z.enum(['region', 'sub_area'])
export type LocationTagKind = z.infer<typeof LocationTagKindEnum>

export const ProfileGenderEnum = z.enum(['male', 'female', 'other', 'prefer_not_to_say'])
export type ProfileGender = z.infer<typeof ProfileGenderEnum>

export const MeasurementUnitsEnum = z.enum(['metric', 'imperial'])
export type MeasurementUnits = z.infer<typeof MeasurementUnitsEnum>

export const ThemePreferenceEnum = z.enum(['light', 'dark', 'system'])
export type ThemePreference = z.infer<typeof ThemePreferenceEnum>

export const GradeSystemEnum = z.enum(['v_scale', 'font_scale', 'yds_equivalent', 'french_equivalent', 'british_equivalent'])
export type GradeSystem = z.infer<typeof GradeSystemEnum>

export const UserClimbStyleEnum = z.enum(['flash', 'top', 'try', 'onsight', 'redpoint'])
export type UserClimbStyle = z.infer<typeof UserClimbStyleEnum>

export const NotificationLevelEnum = z.enum(['all', 'daily', 'off'])
export type NotificationLevel = z.infer<typeof NotificationLevelEnum>

export const CragTypeEnum = z.enum(['crag', 'boulder', 'sport', 'trad', 'mixed'])
export type CragType = z.infer<typeof CragTypeEnum>

export const SubmissionDraftStatusEnum = z.enum(['draft', 'submitted', 'pending_review', 'published'])
export type SubmissionDraftStatus = z.infer<typeof SubmissionDraftStatusEnum>

export const CorrectionTypeEnum = z.enum(['location', 'name', 'line', 'grade', 'removal'])
export type CorrectionType = z.infer<typeof CorrectionTypeEnum>

export const FlagTypeEnum = z.enum([
  'location',
  'route_line',
  'route_name',
  'image_quality',
  'wrong_crag',
  'boundary',
  'access',
  'description',
  'rock_type',
  'name',
  'other',
])
export type FlagType = z.infer<typeof FlagTypeEnum>

export const CommentCategoryEnum = z.enum([
  'access',
  'approach',
  'parking',
  'closure',
  'general',
  'beta',
  'fa_history',
  'safety',
  'gear_protection',
  'conditions',
  'approach_access',
  'descent',
  'rock_quality',
  'highlights',
  'variations',
  'topo_error',
  'line_request',
  'photo_outdated',
  'other_topo',
  'broken_hold',
  'grade',
  'history',
])
export type CommentCategory = z.infer<typeof CommentCategoryEnum>

export const CommentTargetTypeEnum = z.enum(['crag', 'image', 'climb'])
export type CommentTargetType = z.infer<typeof CommentTargetTypeEnum>

export const NotificationTypeEnum = z.enum([
  'flag_resolved',
  'submission_resolved',
  'vote_recorded',
  'comment_reply',
  'rsvp_reminder',
  'new_follower',
  'grade_consensus',
  'crag_metadata_review_requested',
  'crag_metadata_approved',
  'crag_metadata_rejected',
  'crag_metadata_conflict',
])
export type NotificationType = z.infer<typeof NotificationTypeEnum>

export const RockTypeEnum = z.enum([
  'granite',
  'sandstone',
  'limestone',
  'gneiss',
  'basalt',
  'marble',
  'quartzite',
  'slate',
  'other',
])
export type RockType = z.infer<typeof RockTypeEnum>

export const TideDependencyEnum = z.enum(['required', 'optional', 'none'])
export type TideDependency = z.infer<typeof TideDependencyEnum>

export const DisciplineEnum = z.enum(['boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope'])
export type Discipline = z.infer<typeof DisciplineEnum>

export const ApplicationRoleEnum = z.enum(['owner', 'manager', 'head_setter'])
export type ApplicationRole = z.infer<typeof ApplicationRoleEnum>

export const ApplicationFacilityEnum = z.enum(['sport', 'boulder'])
export type ApplicationFacility = z.infer<typeof ApplicationFacilityEnum>
