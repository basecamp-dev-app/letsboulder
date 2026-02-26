import { NextResponse } from 'next/server'

export interface SanitizedErrorResponse {
  error: string
  errorId?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  auth: 'Authentication required',
  unauthorized: 'Unauthorized',
  not_found: 'Resource not found',
  validation: 'Invalid request data',
  rate_limit: 'Rate limit exceeded',
  database: 'Database operation failed',
  external_service: 'External service error',
  unknown: 'An unexpected error occurred'
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    
    if (message.includes('auth') || message.includes('jwt') || message.includes('token')) {
      return ERROR_MESSAGES.auth
    }
    if (message.includes('not found') || message.includes('no rows')) {
      return ERROR_MESSAGES.not_found
    }
    if (message.includes('constraint') || message.includes('foreign key')) {
      return ERROR_MESSAGES.database
    }
    if (message.includes('timeout') || message.includes('fetch')) {
      return ERROR_MESSAGES.external_service
    }
  }
  
  return ERROR_MESSAGES.unknown
}

export function generateErrorId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createErrorJson(error: unknown, context?: string): SanitizedErrorResponse {
  const errorId = generateErrorId()
  console.error(`[${errorId}] ${context || 'Error'}:`, error)
  return {
    error: getErrorMessage(error),
    errorId
  }
}

export function sanitizeError(error: unknown, context?: string): SanitizedErrorResponse {
  return createErrorJson(error, context)
}

export function createErrorResponse(error: unknown, context?: string, status: number = 500): NextResponse {
  const sanitized = createErrorJson(error, context)
  return NextResponse.json(sanitized, { status })
}

export function logError(error: unknown, context: string): void {
  const errorId = generateErrorId()
  console.error(`[${errorId}] ${context}:`, error)
}
