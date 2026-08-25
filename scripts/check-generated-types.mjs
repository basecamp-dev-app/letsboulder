import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const generatedTypesPath = join(root, 'types/database.ts')
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'letsboulder-db-types-'))
const temporaryTypesPath = join(temporaryDirectory, 'database.ts')
const normalizeGeneratedOutput = (content) => content.replace(/\n+$/, '\n')
const localDatabaseUrl = process.env.TEST_DATABASE_URL
  || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

try {
  // Compare in a temporary file so this check never mutates the tracked generated output.
  const result = spawnSync('npx', ['supabase', 'gen', 'types', 'typescript', '--db-url', localDatabaseUrl], {
    cwd: root,
    encoding: 'utf8',
  })

  if (result.error || result.status !== 0) {
    process.stderr.write(
      result.error?.message || result.stderr || 'Supabase type generation failed. Start local Supabase and try again.\n',
    )
    process.exit(result.status ?? 1)
  }

  writeFileSync(temporaryTypesPath, result.stdout)

  if (normalizeGeneratedOutput(readFileSync(generatedTypesPath, 'utf8')) !== normalizeGeneratedOutput(readFileSync(temporaryTypesPath, 'utf8'))) {
    const diff = spawnSync('diff', ['-u', generatedTypesPath, temporaryTypesPath], {
      cwd: root,
      encoding: 'utf8',
    })
    process.stderr.write(
      'Generated database types are out of date. Run `npx --no-install supabase gen types typescript --local > types/database.ts` and review the result.\n',
    )
    if (diff.stdout) process.stderr.write(diff.stdout)
    process.exit(1)
  }

  process.stdout.write('Generated database types match the local Supabase schema.\n')
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
