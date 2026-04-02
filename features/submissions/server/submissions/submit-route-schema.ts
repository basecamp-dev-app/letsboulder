import { z } from 'zod'
import { isValidGrade } from '@/lib/grade-constants'

export const VALID_ROUTE_TYPES = ['sport', 'boulder', 'trad', 'deep-water-solo'] as const
export const VALID_FACE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

function normalizeRouteType(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/_/g, '-')
  return normalized === 'bouldering' ? 'boulder' : normalized
}

const routeTypeSchema = z
  .string()
  .transform(normalizeRouteType)
  .refine(
    (value): value is (typeof VALID_ROUTE_TYPES)[number] =>
      VALID_ROUTE_TYPES.includes(value as (typeof VALID_ROUTE_TYPES)[number]),
    'Invalid route type'
  )

const routePointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

const routeSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, 'Route name is required'),
  grade: z.string().refine(isValidGrade, 'Invalid grade'),
  description: z.string().trim().max(500, 'Route description must be 500 characters or less').optional(),
  points: z.array(routePointSchema).min(2, 'Route must have at least 2 points'),
  sequenceOrder: z.number().finite(),
  imageWidth: z.number().finite(),
  imageHeight: z.number().finite(),
  imageNaturalWidth: z.number().finite(),
  imageNaturalHeight: z.number().finite(),
})

const newSubmissionImageSchema = z.object({
  uploadedBucket: z.string().min(1, 'Image uploadedBucket is required'),
  uploadedPath: z.string().min(1, 'Image uploadedPath is required'),
  uploadedUrl: z.string().optional(),
  width: z.number().finite(),
  height: z.number().finite(),
  naturalWidth: z.number().finite(),
  naturalHeight: z.number().finite(),
  captureDate: z.string().nullable(),
  gpsData: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).nullable(),
  sectorId: z.string().nullable().optional(),
})

const newSubmissionSchema = z.object({
  mode: z.literal('new'),
  images: z.array(newSubmissionImageSchema).min(1, 'At least one image is required'),
  primaryIndex: z.number().int(),
  cragId: z.string().min(1, 'Crag ID is required'),
  faceDirectionsByImage: z.record(z.string(), z.array(z.enum(VALID_FACE_DIRECTIONS)).min(1)).optional(),
  faceDirections: z.array(z.enum(VALID_FACE_DIRECTIONS)).min(1).optional(),
  routes: z.array(routeSchema).min(1, 'At least one route is required'),
  routeType: routeTypeSchema.optional(),
  sectorId: z.string().nullable().optional(),
}).superRefine((body, ctx) => {
  if (body.primaryIndex < 0 || body.primaryIndex >= body.images.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['primaryIndex'],
      message: 'Invalid primary index',
    })
  }

  const hasFaceDirectionsByImage = Object.keys(body.faceDirectionsByImage || {}).length > 0
  const hasLegacyFaceDirections = Array.isArray(body.faceDirections) && body.faceDirections.length > 0

  if (!hasFaceDirectionsByImage && !hasLegacyFaceDirections) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['faceDirectionsByImage'],
      message: 'At least one face direction is required',
    })
  }
})

const existingSubmissionSchema = z.object({
  mode: z.literal('existing'),
  imageId: z.string().min(1, 'Image ID is required'),
  routes: z.array(routeSchema).min(1, 'At least one route is required'),
  routeType: routeTypeSchema.optional(),
})

const cragImageSubmissionSchema = z.object({
  mode: z.literal('crag_image'),
  cragImageId: z.string().min(1, 'Crag image ID is required'),
  routes: z.array(routeSchema).min(1, 'At least one route is required'),
  routeType: routeTypeSchema.optional(),
})

export const submissionRequestSchema = z.discriminatedUnion('mode', [
  newSubmissionSchema,
  existingSubmissionSchema,
  cragImageSubmissionSchema,
])

export type SubmissionRequest = z.infer<typeof submissionRequestSchema>
export type NewSubmissionImage = z.infer<typeof newSubmissionImageSchema>
