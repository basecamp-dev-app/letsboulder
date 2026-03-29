import { NextResponse } from 'next/server'

export const MAX_ROUTES_PER_DAY = 5

export function getSubmissionInfo() {
  return NextResponse.json({
    message: 'Submission endpoint',
    method: 'POST',
    required_fields: {
      common: ['routes (array with name, grade, points, sequenceOrder)'],
      new_image_mode: ['mode: "new"', 'images[]', 'primaryIndex', 'faceDirectionsByImage', 'cragId'],
      existing_image_mode: ['mode: "existing"', 'imageId'],
      crag_image_mode: ['mode: "crag_image"', 'cragImageId'],
    },
    rate_limit: `${MAX_ROUTES_PER_DAY} routes per day`,
  })
}
