import { fail, type ActionResult } from '@/lib/actions/action-result'
import { z, type ZodType } from 'zod'

type ActionValidationSuccess<T> = {
  success: true
  data: T
}

type ActionValidationFailure = {
  success: false
  result: ActionResult
}

export type ActionValidationResult<T> = ActionValidationSuccess<T> | ActionValidationFailure

function createValidationFailure(error: z.ZodError): ActionResult {
  const fieldErrors = error.flatten().fieldErrors
  const firstFieldError = Object.values(fieldErrors as Record<string, string[] | undefined>)
    .flatMap((messages) => messages ?? [])
    .find((message) => typeof message === 'string' && message.length > 0)

  return fail(firstFieldError || 'Invalid request data', 400)
}

export function validateActionInput<TSchema extends ZodType>(
  schema: TSchema,
  input: unknown
): ActionValidationResult<z.infer<TSchema>> {
  const parsed = schema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false,
      result: createValidationFailure(parsed.error),
    }
  }

  return {
    success: true,
    data: parsed.data,
  }
}
