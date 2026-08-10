import { getDisplayName, type ProfileRow } from '@/lib/profile-helpers'
import type { ClimbPackResponse } from '@/features/climb/public'
import type { ImageFirstAttribution } from '@/features/image-first/types'

interface AttributionImageFields {
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
}

function formatContributionHandle(platform: string | null, handle: string | null): string | null {
  const trimmedHandle = typeof handle === 'string' ? handle.trim() : ''
  if (!trimmedHandle) return null
  const normalizedHandle = trimmedHandle.replace(/^@+/, '')
  if (!normalizedHandle) return null
  if (platform === 'instagram') return `@${normalizedHandle}`
  return normalizedHandle
}

function getContributionCreditUrl(platform: string | null, handle: string | null): string | null {
  const trimmedHandle = typeof handle === 'string' ? handle.trim() : ''
  if (!trimmedHandle) return null
  const normalizedHandle = trimmedHandle.replace(/^@+/, '')
  if (!normalizedHandle) return null
  if (platform === 'instagram') return `https://instagram.com/${normalizedHandle}`
  return null
}

function resolveOwnerDisplay(profile: ProfileRow | null, isAnonymousSubmission: boolean): {
  ownerDisplayLabel: string
  ownerProfileId: string | null
} {
  if (isAnonymousSubmission) {
    return {
      ownerDisplayLabel: 'Anonymous Contributor',
      ownerProfileId: null,
    }
  }

  if (profile?.is_public) {
    return {
      ownerDisplayLabel: getDisplayName(profile),
      ownerProfileId: profile.id,
    }
  }

  return {
    ownerDisplayLabel: 'Private Contributor',
    ownerProfileId: null,
  }
}

export function buildRouteAttribution(args: {
  image: AttributionImageFields
  uploaderProfile: ProfileRow | null
  communityEditorsCount: number
}): ImageFirstAttribution {
  const isAnonymousSubmission = args.image.is_anonymous_submission === true
  const owner = resolveOwnerDisplay(args.uploaderProfile, isAnonymousSubmission)
  const canShowCredit = !isAnonymousSubmission && !!args.uploaderProfile?.is_public

  return {
    ownerRoleLabel: 'Original Uploader',
    ownerDisplayLabel: owner.ownerDisplayLabel,
    ownerProfileId: owner.ownerProfileId,
    formattedContributionHandle: canShowCredit
      ? formatContributionHandle(args.image.contribution_credit_platform, args.image.contribution_credit_handle)
      : null,
    contributionCreditUrl: canShowCredit
      ? getContributionCreditUrl(args.image.contribution_credit_platform, args.image.contribution_credit_handle)
      : null,
    communityEditorsRoleLabel: 'Community Editors',
    communityEditorsCount: args.communityEditorsCount,
  }
}

export function buildRouteAttributionFromClimbPack(args: {
  payload: Pick<ClimbPackResponse, 'primary_image' | 'public_submitter'>
  communityEditorsCount: number
}): ImageFirstAttribution {
  const submitter = args.payload.public_submitter
  return buildRouteAttribution({
    image: {
      is_anonymous_submission: args.payload.primary_image?.is_anonymous_submission ?? false,
      contribution_credit_platform: args.payload.primary_image?.contribution_credit_platform ?? null,
      contribution_credit_handle: args.payload.primary_image?.contribution_credit_handle ?? null,
    },
    uploaderProfile: submitter
      ? {
          id: submitter.id,
          username: null,
          display_name: submitter.displayName,
          first_name: null,
          last_name: null,
          avatar_url: null,
          is_public: true,
        }
      : null,
    communityEditorsCount: args.communityEditorsCount,
  })
}
