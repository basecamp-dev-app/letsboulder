import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Linter } from 'eslint'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import consistentFeatureStructureRule from '../../eslint-rules/consistent-feature-structure.js'
import {
  checkFeatures,
  formatFeatureReport,
  TEMPLATE_DIRS,
} from '../../scripts/check-feature-compliance'

describe('feature layout advisory', () => {
  let tempDirectory: string
  let featuresDirectory: string

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'feature-layout-'))
    featuresDirectory = join(tempDirectory, 'features')
    await mkdir(featuresDirectory)
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  it('identifies a full template', async () => {
    await Promise.all(
      TEMPLATE_DIRS.map((directory) =>
        mkdir(join(featuresDirectory, 'complete', directory), { recursive: true }),
      ),
    )

    const [result] = checkFeatures(featuresDirectory)

    expect(result.fullTemplate).toBe(true)
    expect(Object.values(result.rootDirs)).toEqual([true, true, true, true, true])
    expect(formatFeatureReport([result])).toContain('Full template')
  })

  it('describes a partial template as advisory', async () => {
    await mkdir(join(featuresDirectory, 'partial', 'components'), { recursive: true })
    await mkdir(join(featuresDirectory, 'partial', 'server'), { recursive: true })

    const [result] = checkFeatures(featuresDirectory)
    const report = formatFeatureReport([result])

    expect(result.fullTemplate).toBe(false)
    expect(report).toContain('Partial template')
    expect(report).toContain('advisory only; no directories need to be added')
    expect(report).toContain('not present in feature tree: hooks, lib, types')
    expect(report).not.toContain('Non-compliant')
    expect(report).not.toContain('required directories')
  })

  it('counts directories supplied by nested sub-features toward template coverage', async () => {
    await Promise.all(
      TEMPLATE_DIRS.map((directory) =>
        mkdir(join(featuresDirectory, 'admin', 'crags', directory), { recursive: true }),
      ),
    )

    const [result] = checkFeatures(featuresDirectory)
    const report = formatFeatureReport([result])

    expect(result.fullTemplate).toBe(true)
    expect(Object.values(result.rootDirs)).toEqual([false, false, false, false, false])
    expect(Object.values(result.effectiveDirs)).toEqual([true, true, true, true, true])
    expect(report).toContain('Nested sub-feature coverage:')
    expect(report).toContain('supplied by nested sub-features')
  })

  it('emits the ESLint advisory once per partial feature', async () => {
    const featureDirectory = join(featuresDirectory, 'partial')
    const filenames = [
      join(featureDirectory, 'components', 'First.tsx'),
      join(featureDirectory, 'hooks', 'use-second.ts'),
      join(featureDirectory, 'server', 'third.ts'),
    ]
    await Promise.all(
      filenames.map(async (filename) => {
        await mkdir(dirname(filename), { recursive: true })
        await writeFile(filename, 'export const value = true\n')
      }),
    )

    const linter = new Linter({ configType: 'flat', cwd: tempDirectory })
    const config = {
      files: ['features/**/*.{ts,tsx}'],
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      plugins: {
        'local-rules': {
          rules: {
            'consistent-feature-structure': consistentFeatureStructureRule,
          },
        },
      },
      rules: {
        'local-rules/consistent-feature-structure': 'warn',
      },
    } as Linter.Config

    const messages = filenames.flatMap((filename) =>
      linter.verify('export const value = true\n', config, filename),
    )
    const advisories = messages.filter(
      (message) => message.ruleId === 'local-rules/consistent-feature-structure',
    )

    expect(advisories).toHaveLength(1)
    expect(advisories[0]?.message).toContain('uses a partial template')
    expect(advisories[0]?.message).toContain('Feature layout is advisory')
  })
})
