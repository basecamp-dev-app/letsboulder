import { pathToFileURL } from 'node:url'
import { setTimeout } from 'node:timers/promises'
import { z } from 'zod'

export const REQUIRED_WORKFLOWS = [
  { file: 'test.yml', jobs: ['Quality Checks', 'Generated Database Type Drift', 'Next.js Build', 'Unit Tests', 'Component Tests', 'Offline Reliability', 'Media Worker Check'] },
  { file: 'security.yml', jobs: ['Dependency audits'] },
]

const runSchema = z.object({
  id: z.number().int().positive(),
  run_attempt: z.number().int().positive(),
  path: z.string(),
  event: z.string(),
  head_branch: z.string(),
  head_sha: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
})
const jobSchema = z.object({
  name: z.string(),
  run_id: z.number().int().positive(),
  head_sha: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
})
type WorkflowRun = z.infer<typeof runSchema>
type RequestJson = (path: string) => Promise<unknown>

async function listPages<T>(request: RequestJson, path: string, key: string, schema: z.ZodType<T>): Promise<T[]> {
  const results: T[] = []
  for (let page = 1; ; page++) {
    const response = await request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
    const entries = z.object({ [key]: z.array(schema) }).parse(response)[key]
    results.push(...entries)
    if (entries.length < 100) return results
  }
}

export async function verifyReleaseChecks(request: RequestJson, sha: string): Promise<boolean> {
  const verified: Array<{ file: string; run: WorkflowRun }> = []
  for (const workflow of REQUIRED_WORKFLOWS) {
    const runs = await listPages(request,
      `/actions/workflows/${workflow.file}/runs?event=push&branch=main&head_sha=${sha}`, 'workflow_runs', runSchema)
    const run = runs.filter((candidate) => candidate.event === 'push'
      && candidate.head_branch === 'main' && candidate.head_sha === sha
      && candidate.path === `.github/workflows/${workflow.file}`)
      .sort((a, b) => b.id - a.id)[0]
    if (!run || run.status !== 'completed') return false
    if (run.conclusion !== 'success') throw new Error(`${workflow.file} run ${run.id}, attempt ${run.run_attempt}: ${run.conclusion}`)

    // An attempt-specific endpoint cannot pick up skipped deployment-status jobs,
    // another workflow, or an earlier successful attempt of a now-failed run.
    const jobs = await listPages(request,
      `/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs', jobSchema)
    for (const name of workflow.jobs) {
      const matches = jobs.filter((job) => job.name === name && job.run_id === run.id && job.head_sha === sha)
      if (matches.length !== 1 || matches[0].status !== 'completed' || matches[0].conclusion !== 'success') {
        throw new Error(`${workflow.file} attempt ${run.run_attempt}: ${name} must succeed. If this was a partial rerun, rerun all jobs.`)
      }
    }
    verified.push({ file: workflow.file, run })
  }

  // Fail closed if a rerun or a new push run appeared while the jobs were read.
  for (const { file, run } of verified) {
    const current = runSchema.parse(await request(`/actions/runs/${run.id}`))
    if (current.run_attempt !== run.run_attempt || current.status !== 'completed' || current.conclusion !== 'success') return false
    const latest = await listPages(request,
      `/actions/workflows/${file}/runs?event=push&branch=main&head_sha=${sha}`, 'workflow_runs', runSchema)
    if (latest.some((candidate) => candidate.event === 'push' && candidate.head_branch === 'main'
      && candidate.head_sha === sha && candidate.path === run.path && candidate.id > run.id)) return false
  }
  return true
}

async function main() {
  const sha = process.env.SELECTED_COMMIT_SHA || ''
  const repository = process.env.GITHUB_REPOSITORY || ''
  const token = process.env.GITHUB_TOKEN
  if (!/^[0-9a-f]{40}$/.test(sha) || !/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) {
    throw new Error('A full SELECTED_COMMIT_SHA, GITHUB_REPOSITORY and GITHUB_TOKEN are required')
  }
  const request: RequestJson = async (path) => {
    const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`GitHub API returned ${response.status} for ${path}`)
    return await response.json()
  }
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await verifyReleaseChecks(request, sha)) {
      console.log('All mandatory release checks passed for the selected main SHA and workflow attempts.')
      return
    }
    console.log('Waiting for the current main push CI and security workflow attempts.')
    await setTimeout(15_000)
  }
  throw new Error('Timed out waiting for mandatory release checks')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
