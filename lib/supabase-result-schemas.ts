import { z } from 'zod'

export const RouteLineWithImageSchema = z.array(
  z.object({
    id: z.string(),
    image_id: z.string(),
    sequence_order: z.number().nullable(),
    images: z.object({
      id: z.string(),
      url: z.string(),
      is_verified: z.boolean(),
      verification_count: z.number(),
      created_at: z.string(),
    }).nullable(),
  })
)

export type RouteLineWithImage = z.infer<typeof RouteLineWithImageSchema>[number]

export const UserClimbRowSchema = z.array(
  z.object({
    user_id: z.string(),
    climb_id: z.string(),
    style: z.string(),
    created_at: z.string(),
    climbs: z.object({
      id: z.string(),
      grade: z.string(),
      place_id: z.string().nullable(),
      crag_id: z.string().nullable(),
    }).nullable(),
  })
)

export type UserClimbRow = z.infer<typeof UserClimbRowSchema>[number]

export const UserClimbRowWithDetailsSchema = z.array(
  z.object({
    user_id: z.string(),
    style: z.string(),
    created_at: z.string(),
    climb_id: z.string(),
    star_rating: z.number().nullable(),
    climbs: z.object({
      id: z.string(),
      name: z.string(),
      grade: z.string(),
      place_id: z.string().nullable(),
      crag_id: z.string().nullable(),
    }).nullable(),
  })
)

export type UserClimbRowWithDetails = z.infer<typeof UserClimbRowWithDetailsSchema>[number]

export const UserClimbQueryResultSchema = z.array(
  z.object({
    id: z.string(),
    user_id: z.string(),
    created_at: z.string(),
    style: z.string(),
    climbs: z.object({
      id: z.string(),
      grade: z.string(),
    }).nullable(),
  })
)

export type UserClimbQueryResult = z.infer<typeof UserClimbQueryResultSchema>[number]

export const QueueItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  verify_count: z.number(),
  flag_count: z.number(),
  quality_score: z.number().nullable(),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
  climb: z.object({
    id: z.string(),
    name: z.string().nullable(),
    grade: z.string(),
    description: z.string().nullable(),
    image_url: z.string().nullable(),
  }).nullable(),
  crag: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable(),
  submitter: z.object({
    id: z.string(),
    username: z.string().nullable(),
  }).nullable(),
})

export type QueueItem = z.infer<typeof QueueItemSchema>

export const QueueItemVoteSchema = z.object({
  id: z.string(),
  status: z.string(),
  crag_id: z.string(),
  submitter_id: z.string(),
  verify_count: z.number(),
  flag_count: z.number(),
  climb: z.object({
    id: z.string(),
    name: z.string(),
    grade: z.string(),
  }).nullable(),
  crag: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable(),
})

export type QueueItemVote = z.infer<typeof QueueItemVoteSchema>

export const FlagWithRelationsSchema = z.object({
  id: z.string(),
  status: z.string(),
  crag_id: z.string().nullable(),
  climb_id: z.string().nullable(),
  image_id: z.string().nullable(),
  flagger_id: z.string().nullable(),
  flag_type: z.string(),
  comment: z.string(),
  climb: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable(),
  image: z.object({
    id: z.string(),
    url: z.string(),
  }).nullable(),
  crag: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable(),
  created_at: z.string(),
})

export type FlagWithRelations = z.infer<typeof FlagWithRelationsSchema>
