import { NextRequest } from 'next/server'

const INTERNAL_USER_ID_HEADER = 'x-internal-user-id'

interface AuthUserResult {
  data: {
    user: {
      id: string
    } | null
  }
  error?: unknown
}

interface AuthClient {
  auth: {
    getUser: () => Promise<AuthUserResult>
  }
}

export function getTrustedUserIdFromRequest(request: NextRequest | Request): string | null {
  const headerValue = request.headers.get(INTERNAL_USER_ID_HEADER)
  if (!headerValue) return null

  const userId = headerValue.trim()
  if (!userId || userId.length > 128) return null

  return userId
}

export async function resolveUserIdWithFallback(
  request: NextRequest | Request,
  client: AuthClient
): Promise<{ userId: string | null; authError?: unknown }> {
  const headerUserId = getTrustedUserIdFromRequest(request)
  if (headerUserId) {
    return { userId: headerUserId }
  }

  const { data: { user }, error } = await client.auth.getUser()
  return { userId: user?.id ?? null, authError: error }
}
