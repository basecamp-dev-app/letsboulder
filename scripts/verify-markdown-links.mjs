import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ignoredDirectories = new Set(['.git', '.next', 'node_modules', 'playwright-report', 'test-results'])
const markdownFiles = []

function collectMarkdown(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) collectMarkdown(path)
    else if (entry.endsWith('.md')) markdownFiles.push(path)
  }
}

collectMarkdown(root)

let failures = 0
const markdownLink = /\[[^\]]*\]\(([^)]+)\)/g

for (const file of markdownFiles) {
  const content = readFileSync(file, 'utf8')
  for (const match of content.matchAll(markdownLink)) {
    const href = match[1].split(/\s+/)[0]
    if (!href || href.startsWith('#') || /^[a-z]+:/i.test(href)) continue

    const path = decodeURIComponent(href.split('#')[0])
    if (path && !existsSync(resolve(dirname(file), path))) {
      console.error(`DRIFT: broken Markdown link in ${file.slice(root.length + 1)}: ${href}`)
      failures += 1
    }
  }
}

if (failures === 0) console.log(`OK: Markdown links resolve (${markdownFiles.length} files)`)
process.exitCode = failures > 0 ? 1 : 0
