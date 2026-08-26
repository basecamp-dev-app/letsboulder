import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { assertSecretFree } from '@/scripts/media/automate-production-media-lifecycle'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function main(): Promise<void> {
  const reportPath = process.env.RECOVERY_OUTPUT?.trim() || 'production-media-lifecycle-automation.json'
  const healthPath = process.env.HEALTH_AFTER_INPUT?.trim() || 'production-media-lifecycle-health-after.json'
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as unknown
  const health = JSON.parse(await readFile(healthPath, 'utf8')) as unknown
  if (!isRecord(report) || report.schemaVersion !== 1 || !isRecord(health) || !isRecord(health.summary)) {
    throw new Error('Recovery report or after-health report has an invalid schema')
  }
  report.healthAfter = { summary: health.summary }
  assertSecretFree(report)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
