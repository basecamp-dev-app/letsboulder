import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, copyFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const modules = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

describe('offline build manifest', () => {
  it('includes both modules and changes the worker import whenever either module changes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'boulder-manifest-'))
    try {
      for (const dir of ['scripts', '.next/static/chunks', 'public/maplibre']) mkdirSync(path.join(root, dir), { recursive: true })
      const script = path.join(root, 'scripts/generate-sw-build-assets-manifest.mjs')
      copyFileSync('scripts/generate-sw-build-assets-manifest.js', script)
      writeFileSync(path.join(root, '.next/static/chunks/app-123.js'), 'app')
      for (const file of modules) writeFileSync(path.join(root, 'public/maplibre', file), file)
      const generate = () => {
        execFileSync(process.execPath, [script])
        const manifest = JSON.parse(readFileSync(path.join(root, 'public/sw-build-assets.json'), 'utf8')) as { version: string; assets: string[] }
        expect(readFileSync(path.join(root, 'public/sw-build-version.js'), 'utf8')).toContain(JSON.stringify(manifest.version))
        return manifest
      }
      let previous = generate()
      expect(previous.assets).toEqual(expect.arrayContaining(modules.map((file) => `/maplibre/${file}`)))
      expect(generate().version).toBe(previous.version)
      for (const file of modules) {
        writeFileSync(path.join(root, 'public/maplibre', file), `${file} updated`)
        const next = generate()
        expect(next.version).not.toBe(previous.version)
        previous = next
      }
      rmSync(path.join(root, 'public/maplibre', modules[1]))
      expect(() => execFileSync(process.execPath, [script], { stdio: 'pipe' })).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
