import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const SEEDED_PLACE_SLUG_PUBLIC = 'e2e-seeded-place-public'
const SEEDED_PLACE_SLUG_AUTH = 'e2e-seeded-place-auth'

async function ensureSeedData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.log('Skipping global seed data: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
    return
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const seeds = [
    { slug: SEEDED_PLACE_SLUG_PUBLIC, name: 'E2E Seeded Place Public' },
    { slug: SEEDED_PLACE_SLUG_AUTH, name: 'E2E Seeded Place Auth' },
  ]

  const seededPlaces: Array<{ id: string; slug: string; name: string }> = []
  for (const seed of seeds) {
    const { data: existingPlace, error: existingPlaceError } = await supabaseAdmin
      .from('places')
      .select('id, slug, name')
      .eq('country_code', 'GB')
      .eq('slug', seed.slug)
      .maybeSingle()

    if (existingPlaceError) {
      throw new Error(`Failed to look up seeded place ${seed.slug}: ${existingPlaceError.message}`)
    }

    if (existingPlace?.id) {
      seededPlaces.push(existingPlace)
      continue
    }

    const { data, error } = await supabaseAdmin
      .from('crags')
      .insert({
        name: seed.name,
        latitude: null,
        longitude: null,
        type: 'boulder',
        country_code: 'GB',
        slug: seed.slug,
      })
      .select('id, slug, name')
      .single()

    if (error || !data) {
      throw new Error(`Failed to seed place ${seed.slug}: ${error?.message || 'missing row'}`)
    }

    seededPlaces.push(data)
  }

  const seedPath = path.join(process.cwd(), 'playwright', '.auth', 'seed.json')
  fs.mkdirSync(path.dirname(seedPath), { recursive: true })
  fs.writeFileSync(seedPath, JSON.stringify({ seededPlaces }, null, 2))
  console.log(`Seed data saved to ${seedPath}`)
}

async function globalSetup() {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL
    || (process.env.CI ? 'https://dev.letsboulder.com' : 'http://localhost:3000')
  
  const testApiKey = process.env.TEST_API_KEY?.trim()
  const testUserId = process.env.TEST_USER_ID?.trim()
  const testUserEmail = process.env.TEST_USER_EMAIL?.trim()
  const testUserPassword = process.env.TEST_USER_PASSWORD?.trim()
  const internalTestKey = process.env.INTERNAL_TEST_KEY?.trim()

  if (!testApiKey || (!testUserId && !testUserEmail) || !testUserPassword) {
    console.log('TEST_API_KEY, TEST_USER_PASSWORD, and either TEST_USER_EMAIL or TEST_USER_ID are required, skipping authentication')
    await ensureSeedData()
    return
  }

  const authIdentity = testUserEmail || `${testUserId!.slice(0, 8)}...${testUserId!.slice(-4)}`

  console.log(`Setting up authenticated session for ${authIdentity} against ${baseURL}`)

  const browser = await chromium.launch()
  const context = await browser.newContext()
  
  try {
    const authUrl = new URL('/api/test/auth', baseURL)
    authUrl.searchParams.set('api_key', testApiKey)
    if (testUserId) authUrl.searchParams.set('user_id', testUserId)
    if (testUserEmail) authUrl.searchParams.set('email', testUserEmail)

    console.log(`Authenticating via ${new URL('/api/test/auth', baseURL).toString()}`)

    const requestOptions: { headers: Record<string, string> } = {
      headers: {},
    }

    if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
      requestOptions.headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID
      requestOptions.headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET
    }
    requestOptions.headers['x-test-auth'] = '1'

    if (internalTestKey) {
      requestOptions.headers['x-e2e-test-key'] = internalTestKey
      requestOptions.headers['x-internal-test-key'] = internalTestKey
    }

    const response = await context.request.get(authUrl.toString(), requestOptions)
    
    if (!response.ok()) {
      const contentType = response.headers()['content-type'] || 'unknown'
      if (contentType.includes('text/html')) {
        throw new Error(
          `Auth failed: ${response.status()} HTML response from /api/test/auth (likely Cloudflare challenge). ` +
          'Ensure CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are present in Playwright job env.'
        )
      }

      const errorText = await response.text()
      throw new Error(`Auth failed: ${response.status()} - ${errorText.slice(0, 400)}`)
    }

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(`Auth failed: ${data.error} - ${data.details}`)
    }

    console.log(`Authenticated as: ${data.user.email} (${data.user.id})`)

    const cookies = context.cookies()
    console.log(`Cookies set: ${(await cookies).map(c => c.name).join(', ')}`)

    const storageStatePath = path.join(process.cwd(), 'playwright', '.auth', 'user.json')
    
    const storageDir = path.dirname(storageStatePath)
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true })
    }

    await context.storageState({ path: storageStatePath })

    await ensureSeedData()

    console.log(`Session saved to ${storageStatePath}`)
  } catch (error) {
    console.error('Failed to set up authenticated session:', error)
    throw error
  } finally {
    await browser.close()
  }
}

export default globalSetup
