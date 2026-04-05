import { NextRequest } from 'next/server'

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

export async function resolveUserIdWithFallback(
  _request: NextRequest | Request,
  client: AuthClient
): Promise<{ userId: string | null; authError?: unknown }> {
  try {
    const { data: { user }, error } = await client.auth.getUser()
    return { userId: user?.id ?? null, authError: error }
  } catch (error) {
    return { userId: null, authError: error }
  }
}
