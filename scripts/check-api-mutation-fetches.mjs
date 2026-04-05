import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'

const FILE_PATTERNS = ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'features/**/*.{ts,tsx}', 'hooks/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}']
const METHOD_PATTERN = /method\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i
const API_FETCH_PATTERN = /fetch\s*\(\s*['"]\/api\//g
const IGNORE_PATH_SEGMENTS = ['/tests/', '/node_modules/', '/.next/']
const ALLOWED_PATH_PREFIXES = ['/api/dev-logger']

const violations = []

for (const pattern of FILE_PATTERNS) {
  for (const filePath of globSync(pattern)) {
    if (IGNORE_PATH_SEGMENTS.some(segment => filePath.includes(segment))) continue

    const source = readFileSync(filePath, 'utf8')

    for (const match of source.matchAll(API_FETCH_PATTERN)) {
      const start = match.index ?? 0
      const snippet = source.slice(start, start + 240)

      if (ALLOWED_PATH_PREFIXES.some(prefix => snippet.startsWith(`fetch('${prefix}`) || snippet.startsWith(`fetch("${prefix}`))) {
        continue
      }

      if (!METHOD_PATTERN.test(snippet)) continue

      const line = source.slice(0, start).split('\n').length
      violations.push(`${filePath}:${line} raw state-changing /api/ fetch detected; use csrfFetch()`) 
    }
  }
}

if (violations.length > 0) {
  console.error('Raw state-changing /api/ fetch calls are not allowed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('No raw state-changing /api/ fetch calls found.')
