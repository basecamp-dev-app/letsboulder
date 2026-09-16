import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
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

  const maplibreAssets = ['/maplibre/maplibre-gl-worker.mjs', '/maplibre/maplibre-gl-shared.mjs']
  assetPaths.push(...maplibreAssets)
  assetPaths.sort()
  const hash = crypto.createHash('sha256').update(assetPaths.join('\n'))
  for (const asset of maplibreAssets) {
    hash.update(await fs.readFile(path.join(projectRoot, 'public', asset)))
  }
  const version = hash.digest('hex').slice(0, 20)
  // Imported by sw.js: a changed import triggers the browser's worker update
  // even when the service worker source itself has not changed.
  await fs.writeFile(path.join(projectRoot, 'public', 'sw-build-version.js'),
    `self.__LETSBOULDER_BUILD_VERSION = ${JSON.stringify(version)};\n`)

  await fs.writeFile(outputPath, `${JSON.stringify({ version, assets: assetPaths }, null, 2)}\n`)
  process.stdout.write(`Wrote ${assetPaths.length} build assets (${version}) to ${path.relative(projectRoot, outputPath)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exit(1)
})
