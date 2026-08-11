import { isIP } from 'node:net'

import { Pool, type PoolClient, type PoolConfig } from 'pg'

export const DEFAULT_DATABASE_TEST_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

type DatabasePoolOptions = Pick<PoolConfig, 'max' | 'statement_timeout'>

export function validateDatabaseTestUrl(
  databaseUrl: string,
  allowNonLocal = false,
): string {
  let parsedDatabaseUrl: URL
  try {
    parsedDatabaseUrl = new URL(databaseUrl)
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL')
  }

  if (parsedDatabaseUrl.protocol !== 'postgres:' && parsedDatabaseUrl.protocol !== 'postgresql:') {
    throw new Error('TEST_DATABASE_URL must use the postgres or postgresql protocol')
  }

  const hostname = parsedDatabaseUrl.hostname.replace(/^\[|\]$/g, '')
  const isLoopback = hostname === 'localhost' || hostname === '::1'
    || (isIP(hostname) === 4 && hostname.startsWith('127.'))

  if (!isLoopback && !allowNonLocal) {
    throw new Error(
      `Refusing database tests against non-loopback host ${hostname}. `
      + 'Set TEST_DATABASE_ALLOW_NON_LOCAL=true to opt in explicitly.',
    )
  }

  return databaseUrl
}

export function createDatabaseTestHarness(options: DatabasePoolOptions = {}) {
  const connectionString = validateDatabaseTestUrl(
    process.env.TEST_DATABASE_URL || DEFAULT_DATABASE_TEST_URL,
    process.env.TEST_DATABASE_ALLOW_NON_LOCAL === 'true',
  )
  const pool = new Pool({ connectionString, ...options })

  async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect()
    await client.query('begin')
    try {
      return await run(client)
    } finally {
      await client.query('rollback')
      client.release()
    }
  }

  return {
    connectionString,
    pool,
    transaction,
    close: () => pool.end(),
  }
}
