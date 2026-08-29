#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const MiB = 1024 * 1024
const LIMITS = { summary: 5 * MiB, successful: 25 * MiB, browser: 200 * MiB, combined: 375 * MiB }
const APP = ['horizontal-overflow', 'clipped-overlay', 'hidden-action', 'keyboard-obstruction', 'gesture-trap']

function walk(root) { const out = []; if (!fs.existsSync(root)) return out; for (const entry of fs.readdirSync(root, { withFileTypes: true })) { const file = path.join(root, entry.name); if (entry.isDirectory()) out.push(...walk(file)); else if (entry.isFile()) out.push(file) } return out }
function bytes(root) { return walk(root).reduce((sum, file) => sum + fs.statSync(file).size, 0) }
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }
function fmt(value) { return value < 1024 ? `${value} B` : value < MiB ? `${(value / 1024).toFixed(1)} KiB` : `${(value / MiB).toFixed(2)} MiB` }
function type(file, name = '', contentType = '') { const value = `${file} ${name} ${contentType}`.toLowerCase(); if (/\.png$|\.jpe?g$|image\//.test(value)) return 'screenshot'; if (/\.webm$|video\//.test(value)) return 'video'; if (/\.zip$|trace/.test(value)) return 'trace'; return 'other' }
function safe(value) { return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'test' }
function browserName(project, runId) { return `runtime-audit-failures-${project === 'mobile-chrome' ? 'chromium' : project === 'mobile-safari' ? 'webkit' : safe(project)}-${runId}` }
function move(source, target) { fs.mkdirSync(path.dirname(target), { recursive: true }); try { fs.renameSync(source, target) } catch (error) { if (error?.code !== 'EXDEV') throw error; fs.copyFileSync(source, target); fs.unlinkSync(source) } }

function inspect(root) {
  const base = path.resolve(root); const files = walk(base).map(file => ({ file, rel: path.relative(base, file), size: fs.statSync(file).size, digest: hash(file), kind: type(file) }))
  const tops = new Map(), groups = new Map(), digests = new Map()
  for (const item of files) { const top = item.rel.split(path.sep)[0]; tops.set(top, (tops.get(top) || 0) + item.size); groups.set(item.kind, (groups.get(item.kind) || 0) + item.size); const same = digests.get(item.digest) || []; same.push(item); digests.set(item.digest, same) }
  const duplicates = [...digests.values()].filter(list => list.length > 1)
  const cross = duplicates.filter(list => new Set(list.map(item => item.rel.split(path.sep)[0])).size > 1)
  const duplicateBytes = cross.reduce((sum, list) => sum + list.slice(1).reduce((value, item) => value + item.size, 0), 0)
  const retries = files.filter(item => /retry|attempt-[1-9]/i.test(item.rel))
  console.log(`Runtime audit artifact inspection: ${base}`); console.log(`Total: ${fmt(files.reduce((s, f) => s + f.size, 0))} (${files.length} files)`)
  console.log('Top-level trees:'); for (const [name, size] of [...tops].sort((a, b) => b[1] - a[1])) console.log(`  ${name}: ${fmt(size)}`)
  console.log('Attachment groups:'); for (const kind of ['screenshot', 'video', 'trace', 'other']) console.log(`  ${kind}: ${fmt(groups.get(kind) || 0)}`)
  console.log(`Cross-tree duplicate payloads: ${cross.length} groups, ${fmt(duplicateBytes)} duplicate bytes`)
  console.log(`Equivalent screenshot groups: ${duplicates.filter(list => list[0].kind === 'screenshot').length}`)
  console.log(`Retry/attempt recordings: ${retries.length} files, ${fmt(retries.reduce((s, f) => s + f.size, 0))}`)
  console.log('Largest files:'); for (const item of [...files].sort((a, b) => b.size - a.size).slice(0, 20)) console.log(`  ${fmt(item.size).padStart(11)}  ${item.rel}`)
}

function counts(rows, selector) { const result = {}; for (const row of rows) { const key = selector(row); result[key] ||= { total: 0, passed: 0, failed: 0, missing: 0 }; result[key].total++; if (!row.recorded || row.finalStatus === 'missing') result[key].missing++; else if (row.finalStatus === 'passed') result[key].passed++; else if (row.finalStatus !== 'skipped') result[key].failed++ } return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b))) }
function table(title, data) { const lines = [`### ${title}`, '', '| Value | Total | Passed | Failed | Missing |', '| --- | ---: | ---: | ---: | ---: |']; for (const [key, value] of Object.entries(data)) lines.push(`| \`${key.replaceAll('|', '\\|')}\` | ${value.total} | ${value.passed} | ${value.failed} | ${value.missing} |`); if (!Object.keys(data).length) lines.push('| _none_ | 0 | 0 | 0 | 0 |'); return lines.join('\n') }

function finalize(options) {
  const report = path.resolve(options.report || 'runtime-audit-work/report/runtime-audit-reporter.json'), work = path.resolve(options.work || 'runtime-audit-work'), output = path.resolve(options.output || 'runtime-audit-artifacts'), runId = options.runId || process.env.GITHUB_RUN_ID || 'local', expectedRows = Number(options.expectedRows || process.env.RUNTIME_AUDIT_EXPECTED_ROWS || 0)
  const summary = path.join(output, 'summary'), failures = path.join(output, 'failures'); fs.rmSync(output, { recursive: true, force: true }); fs.mkdirSync(summary, { recursive: true })
  if (!fs.existsSync(report)) { const matrix = { schemaVersion: 2, expectedRowCount: expectedRows, recordedRowCount: 0, missingRows: [], validationErrors: [{ classification: 'missing-evidence-row', details: `Reporter output missing: ${report}` }], rows: [] }; fs.writeFileSync(path.join(summary, 'runtime-audit-evidence.json'), JSON.stringify(matrix, null, 2)); fs.writeFileSync(path.join(summary, 'runtime-audit-artifact-manifest.json'), JSON.stringify({ schemaVersion: 1, files: [] }, null, 2)); fs.writeFileSync(path.join(summary, 'runtime-audit-summary.md'), '# Runtime audit summary\n\nReporter output was missing.\n'); console.error(`::error::Reporter output missing: ${report}`); return 1 }
  const raw = JSON.parse(fs.readFileSync(report, 'utf8')), rows = raw.rows || [], validationErrors = [], missingRows = rows.filter(row => !row.recorded || row.finalStatus === 'missing').map(row => row.key), duplicates = raw.duplicateExpectedKeys || []
  if (expectedRows && raw.expectedRowCount !== expectedRows) validationErrors.push({ classification: 'missing-evidence-row', details: `Expected test graph size ${expectedRows}; reporter discovered ${raw.expectedRowCount}.` })
  if (rows.length !== raw.expectedRowCount) validationErrors.push({ classification: 'missing-evidence-row', details: `Expected ${raw.expectedRowCount} rows; final matrix has ${rows.length}.` })
  if (missingRows.length) validationErrors.push({ classification: 'missing-evidence-row', details: `${missingRows.length} rows have no recorded evidence.` })
  if (duplicates.length) validationErrors.push({ classification: 'missing-evidence-row', details: `${duplicates.length} duplicate row keys were discovered.` })
  const attachmentPaths = new Set((raw.attempts || []).flatMap(attempt => attempt.attachments || []).map(a => a.path).filter(Boolean).map(file => path.resolve(file)))
  const orphan = walk(work).filter(file => ['video', 'trace'].includes(type(file)) && !attachmentPaths.has(path.resolve(file)))
  if (orphan.length) validationErrors.push({ classification: 'test-failure', details: `${orphan.length} orphan video/trace files cannot be associated with an evidence row or explicit failure.` })
  const manifest = [], retained = new Map(), failedRows = rows.filter(row => !['passed', 'skipped', 'missing'].includes(row.finalStatus))
  for (const row of failedRows) {
    const attempt = (raw.attempts || []).find(item => item.key === row.key && item.attempt === row.attempt); const kept = []
    for (const kind of ['screenshot', 'video', 'trace']) {
      const candidates = (attempt?.attachments || []).filter(a => a.path && fs.existsSync(a.path) && type(a.path, a.name, a.contentType) === kind)
      const attachment = kind === 'screenshot' ? candidates.find(a => a.name === 'runtime-audit-screenshot') || candidates[0] : candidates[0]
      if (!attachment) { validationErrors.push({ classification: row.classification || 'test-failure', details: `${row.key} final failure lacks required ${kind} evidence.` }); continue }
      const ext = path.extname(attachment.path) || (kind === 'screenshot' ? '.png' : kind === 'video' ? '.webm' : '.zip'), rel = path.join(safe(row.testId), `attempt-${row.attempt}`, `${kind}${ext}`), target = path.join(failures, row.project, rel); move(attachment.path, target)
      const entry = { testId: row.testId, browserProject: row.project, route: row.route, state: row.state, viewport: row.viewport, attempt: row.attempt, finalStatus: row.finalStatus, artifactType: kind, artifactName: browserName(row.project, runId), relativePath: rel, byteSize: fs.statSync(target).size, sha256: hash(target), retentionReason: `final-${row.classification || 'failure'}` }; manifest.push(entry); kept.push({ artifactType: kind, artifactName: entry.artifactName, relativePath: rel, byteSize: entry.byteSize, sha256: entry.sha256 })
    }
    retained.set(row.key, kept)
  }
  const finalRows = rows.map(row => ({ ...row, retainedEvidence: retained.get(row.key) || [] }))
  for (const row of finalRows) {
    if (row.viewport?.width >= 320 && row.viewport?.width <= 430 && row.issues?.some(issue => APP.includes(issue.category)) && !row.retainedEvidence.some(item => item.artifactType === 'screenshot')) validationErrors.push({ classification: 'application-finding', details: `${row.key} has a 320–430 px application finding without a retained screenshot.` })
    if (row.viewport?.orientation === 'landscape' && row.finalStatus !== 'passed' && (row.checks?.landscape !== 'recorded' || !row.retainedEvidence.some(item => item.artifactType === 'screenshot'))) validationErrors.push({ classification: row.classification || 'test-failure', details: `${row.key} landscape failure lacks a recorded check or screenshot.` })
  }
  fs.rmSync(path.join(work, 'test-results'), { recursive: true, force: true }); fs.rmSync(path.join(path.dirname(report), 'attachments'), { recursive: true, force: true })
  const appFindings = Object.fromEntries(APP.map(category => [category, finalRows.flatMap(row => (row.issues || []).filter(issue => issue.category === category).map(issue => ({ testId: row.testId, project: row.project, route: row.route, state: row.state, viewport: row.viewport.label, details: issue.details }))) ]))
  const harness = finalRows.flatMap(row => { const fixtures = (row.issues || []).filter(issue => issue.category === 'state-fixture'); if (fixtures.length) return fixtures.map(issue => ({ testId: row.testId, project: row.project, route: row.route, state: row.state, viewport: row.viewport.label, classification: row.classification, details: issue.details })); if (!['passed', 'application-finding'].includes(row.classification)) return [{ testId: row.testId, project: row.project, route: row.route, state: row.state, viewport: row.viewport.label, classification: row.classification, details: row.error || row.classification }]; return [] })
  const matrix = { schemaVersion: 2, generatedAt: new Date().toISOString(), runId, expectedRowCount: raw.expectedRowCount, recordedRowCount: finalRows.filter(row => row.recorded).length, missingRows, duplicateRows: duplicates, totals: { passed: finalRows.filter(row => row.finalStatus === 'passed').length, failed: failedRows.length, skipped: finalRows.filter(row => row.finalStatus === 'skipped').length, missing: missingRows.length }, counts: { browser: counts(finalRows, row => row.project), viewport: counts(finalRows, row => row.viewport.label), route: counts(finalRows, row => row.route), state: counts(finalRows, row => row.state) }, applicationFindings: appFindings, harnessFailures: harness, validationErrors, rows: finalRows }
  fs.writeFileSync(path.join(summary, 'runtime-audit-artifact-manifest.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt: matrix.generatedAt, runId, files: manifest }, null, 2)}\n`)
  const md = ['# Runtime audit summary', '', `- Expected rows: **${matrix.expectedRowCount}**`, `- Recorded rows: **${matrix.recordedRowCount}**`, `- Missing rows: **${missingRows.length}**`, `- Passed: **${matrix.totals.passed}**`, `- Failed: **${matrix.totals.failed}**`, '', table('By browser', matrix.counts.browser), '', table('By viewport', matrix.counts.viewport), '', table('By route', matrix.counts.route), '', table('By state fixture', matrix.counts.state), '', '## Application findings', '']
  for (const category of APP) { md.push(`### ${category} (${appFindings[category].length})`, ''); md.push(...(appFindings[category].length ? appFindings[category].map(item => `- \`${item.project}\` \`${item.viewport}\` \`${item.route}\` \`${item.state}\`: ${item.details}`) : ['_None._']), '') }
  md.push('## Harness / infrastructure failures', '', ...(harness.length ? harness.map(item => `- **${item.classification}** — \`${item.project}\` \`${item.viewport}\` \`${item.route}\` \`${item.state}\`: ${item.details}`) : ['_None._']), '', '## Retained failure evidence', '')
  if (manifest.length) { md.push('| Test | Browser | Type | Artifact | Relative path | Bytes |', '| --- | --- | --- | --- | --- | ---: |'); for (const item of manifest) md.push(`| \`${item.testId}\` | \`${item.browserProject}\` | ${item.artifactType} | \`${item.artifactName}\` | \`${item.relativePath}\` | ${item.byteSize} |`) } else md.push('_No failure recordings retained._')
  const summarySizeBefore = bytes(summary), bundles = fs.existsSync(failures) ? fs.readdirSync(failures, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => ({ project: e.name, size: bytes(path.join(failures, e.name)) })) : [], combined = summarySizeBefore + bundles.reduce((s, b) => s + b.size, 0)
  if (summarySizeBefore > LIMITS.summary) validationErrors.push({ classification: 'artifact-budget', details: `Summary ${fmt(summarySizeBefore)} exceeds ${fmt(LIMITS.summary)}.` })
  for (const bundle of bundles) if (bundle.size > LIMITS.browser) validationErrors.push({ classification: 'artifact-budget', details: `${bundle.project} failure bundle ${fmt(bundle.size)} exceeds ${fmt(LIMITS.browser)}.` })
  if (!failedRows.length && combined > LIMITS.successful) validationErrors.push({ classification: 'artifact-budget', details: `Successful routine output ${fmt(combined)} exceeds ${fmt(LIMITS.successful)}.` })
  if (combined > LIMITS.combined) validationErrors.push({ classification: 'artifact-budget', details: `Runtime audit output ${fmt(combined)} exceeds reserved ${fmt(LIMITS.combined)} budget; 25 MiB remains reserved for the legacy nightly artifact.` })
  if (validationErrors.length) { md.push('', '## Evidence validation', '', ...validationErrors.map(error => `- **${error.classification}** — ${error.details}`)); if (validationErrors.some(error => error.classification === 'artifact-budget')) { md.push('', 'Largest retained files:', ''); for (const file of walk(output).map(file => ({ file, size: fs.statSync(file).size })).sort((a, b) => b.size - a.size).slice(0, 15)) md.push(`- ${fmt(file.size)} — \`${path.relative(output, file.file)}\``) } }
  matrix.validationErrors = validationErrors; fs.writeFileSync(path.join(summary, 'runtime-audit-evidence.json'), `${JSON.stringify(matrix, null, 2)}\n`); fs.writeFileSync(path.join(summary, 'runtime-audit-summary.md'), `${md.join('\n')}\n`)
  console.log(`Runtime audit rows: expected=${matrix.expectedRowCount} recorded=${matrix.recordedRowCount} missing=${missingRows.length} passed=${matrix.totals.passed} failed=${matrix.totals.failed}`); console.log(`Runtime audit artifact sizes: summary=${fmt(bytes(summary))} combined=${fmt(bytes(output))}`); for (const error of validationErrors) console.error(`::error title=Runtime audit ${error.classification}::${error.details}`)
  return validationErrors.length ? 1 : 0
}

const argv = process.argv.slice(2), command = argv.shift(), options = {}; for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const key = argv[i].slice(2), value = argv[i + 1]; if (value && !value.startsWith('--')) { options[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value; i++ } else options[key] = true }
if (command === 'inspect') inspect(options.root || process.cwd()); else if (command === 'finalize') process.exitCode = finalize(options); else { console.error('Usage: runtime-audit-artifacts.mjs inspect --root <dir> | finalize [--run-id <id>] [--expected-rows <n>]'); process.exitCode = 2 }
