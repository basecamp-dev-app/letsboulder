import { NextResponse } from 'next/server'
import { z, type ZodType } from 'zod'

type ValidationSuccess<T> = {
  success: true
  data: T
}

type ValidationFailure = {
  success: false
  response: NextResponse
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

function createValidationResponse(error: z.ZodError): NextResponse {
  return NextResponse.json(
    {
      error: 'Invalid request data',
      fieldErrors: error.flatten().fieldErrors,
    },
    { status: 400 }
  )
}

export function parseWithSchema<TSchema extends ZodType>(
  schema: TSchema,
  input: unknown
): ValidationResult<z.infer<TSchema>> {
  const parsed = schema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false,
      response: createValidationResponse(parsed.error),
    }
  }

  return {
    success: true,
    data: parsed.data,
  }
}
