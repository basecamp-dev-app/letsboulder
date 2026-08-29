import fs from 'node:fs'

const DEFAULT_TRUSTED_HOSTS = ['letsboulder.com', 'staging.letsboulder.com']
const AUTHENTICATED_TRUSTED_HOSTS = new Set<string>()

export function validateTrustedBaseUrl(rawUrl: string, allowVercelHost = false): string {
  const value = rawUrl.trim()
  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    throw new Error('Playwright base URL must be a valid HTTPS URL')
  }

  const trustedHosts = DEFAULT_TRUSTED_HOSTS.map(host => host.toLowerCase())
  const isTrustedHost = trustedHosts.includes(parsed.hostname.toLowerCase())
  const isVercelHost = parsed.hostname.toLowerCase().endsWith('.vercel.app')

  if (parsed.protocol !== 'https:' || (!isTrustedHost && !(allowVercelHost && isVercelHost))) {
    throw new Error('Playwright base URL is not a trusted deployment origin')
  }

  const authority = value.slice('https://'.length).split(/[/?#]/, 1)[0]
  if (parsed.username || parsed.password || authority.includes(':') || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Playwright base URL must contain only a trusted origin')
  }

  return parsed.origin
}

export function validateAuthenticatedBaseUrl(rawUrl: string): string {
  const baseUrl = validateTrustedBaseUrl(rawUrl)
  const hostname = new URL(baseUrl).hostname.toLowerCase()
  if (!AUTHENTICATED_TRUSTED_HOSTS.has(hostname)) {
    throw new Error('Authenticated Playwright tests require a protected trusted deployment origin')
  }
  return baseUrl
}

export function isAuthenticatedTrustedBaseUrl(rawUrl: string): boolean {
  try {
    validateAuthenticatedBaseUrl(rawUrl)
    return true
  } catch {
    return false
  }
}

type VercelDeployment = {
  url?: unknown
  projectId?: unknown
  target?: unknown
}

function isVercelDeployment(value: unknown): value is VercelDeployment {
  return typeof value === 'object' && value !== null
}

async function resolveVercelDeployment(deploymentId: string): Promise<string> {
  const token = process.env.VERCEL_API_TOKEN?.trim()
  const projectId = process.env.VERCEL_PROJECT_ID?.trim()
  if (!token || !projectId) {
    throw new Error('VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required to resolve a deployment ID')
  }

  const response = await fetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Vercel deployment lookup failed with HTTP ${response.status}`)

  const payload: unknown = await response.json()
  if (!isVercelDeployment(payload) || payload.projectId !== projectId || payload.target !== 'preview' || typeof payload.url !== 'string') {
    throw new Error('Vercel deployment does not belong to the configured project')
  }

  return validateTrustedBaseUrl(`https://${payload.url}`, true)
}

export async function resolvePlaywrightBaseUrl(): Promise<string> {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim()
  if (deploymentId) return resolveVercelDeployment(deploymentId)

  const requestedUrl = process.env.PLAYWRIGHT_REQUESTED_BASE_URL?.trim()
  if (!requestedUrl) throw new Error('A trusted deployment URL or Vercel deployment ID is required')
  return validateTrustedBaseUrl(requestedUrl)
}

async function main() {
  const baseUrl = await resolvePlaywrightBaseUrl()
  const outputPath = process.env.GITHUB_OUTPUT
  if (outputPath) {
    fs.appendFileSync(outputPath, `base_url=${baseUrl}\n`)
    fs.appendFileSync(outputPath, `authenticated_allowed=${isAuthenticatedTrustedBaseUrl(baseUrl)}\n`)
  }
  else process.stdout.write(`${baseUrl}\n`)
}

if (process.argv[1]?.endsWith('deployment-url.ts')) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : 'Unable to resolve Playwright base URL'
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
