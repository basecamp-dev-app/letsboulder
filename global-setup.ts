import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

async function globalSetup() {
  const baseURL = process.env.CI 
    ? 'https://dev.letsboulder.com' 
    : 'http://localhost:3000'
  
  const testApiKey = process.env.TEST_API_KEY?.trim()
  const testUserId = process.env.TEST_USER_ID?.trim()
  const testUserPassword = process.env.TEST_USER_PASSWORD?.trim()
  const internalTestKey = process.env.INTERNAL_TEST_KEY?.trim()

  if (!testApiKey || !testUserId || !testUserPassword) {
    console.log('TEST_API_KEY, TEST_USER_ID, and TEST_USER_PASSWORD are required, skipping authentication')
    return
  }

  const maskedUserId = `${testUserId.slice(0, 8)}...${testUserId.slice(-4)}`

  console.log(`Setting up authenticated session for ${maskedUserId} against ${baseURL}`)

  const browser = await chromium.launch()
  const context = await browser.newContext()
  
  try {
    const authUrl = new URL('/api/test/auth', baseURL)
    authUrl.searchParams.set('api_key', testApiKey)
    authUrl.searchParams.set('user_id', testUserId)

    console.log(`Authenticating via ${new URL('/api/test/auth', baseURL).toString()}`)

    const requestOptions: { headers: Record<string, string> } = {
      headers: {},
    }

    if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
      requestOptions.headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID
      requestOptions.headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET
    }
    requestOptions.headers['x-test-auth'] = '1'

    if (!baseURL.includes('localhost') && !baseURL.includes('127.0.0.1') && internalTestKey) {
      requestOptions.headers['x-internal-test-key'] = internalTestKey
    }

    const response = await context.request.get(authUrl.toString(), requestOptions)
    
    if (!response.ok()) {
      const errorText = await response.text()
      throw new Error(`Auth failed: ${response.status()} - ${errorText}`)
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
    
    console.log(`Session saved to ${storageStatePath}`)
  } catch (error) {
    console.error('Failed to set up authenticated session:', error)
    throw error
  } finally {
    await browser.close()
  }
}

export default globalSetup
