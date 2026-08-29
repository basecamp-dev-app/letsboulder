import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

import type { RuntimeAuditEvidence } from '../fixtures/runtime-audit'

class RuntimeAuditReporter implements Reporter {
  private readonly rows = new Map<string, RuntimeAuditEvidence>()

  onTestEnd(_test: TestCase, result: TestResult) {
    for (const attachment of result.attachments.filter(({ name }) => name === 'runtime-audit-evidence')) {
      if (!attachment.body) continue
      const row = JSON.parse(attachment.body.toString()) as RuntimeAuditEvidence
      const key = `${row.project}:${row.viewport.label}:${row.route}:${row.state}`
      this.rows.set(key, { ...row, outcome: result.status, retry: result.retry })
    }
  }

  onEnd() {
    const outputDirectory = path.resolve(process.cwd(), process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results')
    mkdirSync(outputDirectory, { recursive: true })
    const rows = Array.from(this.rows.values()).sort((left, right) => {
      return `${left.project}:${left.viewport.label}:${left.route}:${left.state}`.localeCompare(`${right.project}:${right.viewport.label}:${right.route}:${right.state}`)
    })
    writeFileSync(path.join(outputDirectory, 'runtime-audit-evidence.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`, 'utf8')
  }
}

export default RuntimeAuditReporter
