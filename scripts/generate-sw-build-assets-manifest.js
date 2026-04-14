const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

const projectRoot = path.resolve(__dirname, '..')
const nextStaticDir = path.join(projectRoot, '.next', 'static')
const outputPath = path.join(projectRoot, 'public', 'sw-build-assets.json')

async function collectFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath))
      continue
    }

    files.push(fullPath)
  }

  return files
}

async function main() {
  const files = await collectFiles(nextStaticDir)
  const assetPaths = files
    .map((filePath) => path.relative(nextStaticDir, filePath).split(path.sep).join('/'))
    .filter((assetPath) => assetPath.startsWith('chunks/') || assetPath.startsWith('media/') || assetPath.endsWith('/_buildManifest.js') || assetPath.endsWith('/_ssgManifest.js') || assetPath.endsWith('/_clientMiddlewareManifest.js'))
    .map((assetPath) => `/_next/static/${assetPath}`)
    .sort()

  const version = crypto.createHash('sha1').update(assetPaths.join('\n')).digest('hex').slice(0, 12)

  await fs.writeFile(outputPath, `${JSON.stringify({ version, assets: assetPaths }, null, 2)}\n`)
  process.stdout.write(`Wrote ${assetPaths.length} build assets (${version}) to ${path.relative(projectRoot, outputPath)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exit(1)
})
