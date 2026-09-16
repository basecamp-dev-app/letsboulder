import { describe, expect, it, vi } from 'vitest'
import { REQUIRED_WORKFLOWS, verifyReleaseChecks } from '@/scripts/release/verify-checks'

const sha = 'a'.repeat(40)
function fixtures() {
  const runs = REQUIRED_WORKFLOWS.map((workflow, index) => ({
    id: index + 1, run_attempt: 2, path: `.github/workflows/${workflow.file}`,
    event: 'push', head_branch: 'main', head_sha: sha, status: 'completed', conclusion: 'success',
  }))
  const jobs = REQUIRED_WORKFLOWS.map((workflow, index) => workflow.jobs.map((name) => ({
    name, run_id: index + 1, head_sha: sha, status: 'completed', conclusion: 'success',
  })))
  const request = vi.fn(async (path: string) => {
    const index = path.includes('security.yml') || path.includes('/runs/2') ? 1 : 0
    if (path.includes('/workflows/')) return { workflow_runs: [runs[index],
      { ...runs[index], id: 99, event: 'deployment_status', conclusion: 'skipped' },
      { ...runs[index], id: 100, event: 'workflow_dispatch' },
      { ...runs[index], id: 101, head_sha: 'b'.repeat(40) },
      { ...runs[index], id: 102, head_branch: 'staging' },
      { ...runs[index], id: 103, path: '.github/workflows/untrusted.yml' },
    ] }
    if (path.includes('/attempts/2/jobs')) return { jobs: jobs[index] }
    if (path === `/actions/runs/${index + 1}`) return runs[index]
    throw new Error(`Unexpected request: ${path}`)
  })
  return { request, runs, jobs }
}

describe('production check selection', () => {
  it('ignores deployment-status and unrelated runs and reads exact attempt jobs', async () => {
    const { request } = fixtures()
    expect(await verifyReleaseChecks(request, sha)).toBe(true)
    expect(request).toHaveBeenCalledWith('/actions/runs/1/attempts/2/jobs?per_page=100&page=1')
    expect(request).toHaveBeenCalledWith('/actions/runs/2/attempts/2/jobs?per_page=100&page=1')
  })

  it.each(['failure', 'cancelled', 'timed_out', 'skipped'])('blocks a %s current attempt', async (conclusion) => {
    const { request, runs } = fixtures()
    runs[0].conclusion = conclusion
    await expect(verifyReleaseChecks(request, sha)).rejects.toThrow(conclusion)
  })

  it('waits for an in-progress rerun instead of accepting previous success', async () => {
    const { request, runs } = fixtures()
    runs[0].status = 'in_progress'
    expect(await verifyReleaseChecks(request, sha)).toBe(false)
  })

  it.each(['failure', 'skipped', 'cancelled'])('blocks a %s mandatory job even when the workflow reports success', async (conclusion) => {
    const { request, jobs } = fixtures()
    jobs[0][0].conclusion = conclusion
    await expect(verifyReleaseChecks(request, sha)).rejects.toThrow('Quality Checks must succeed')
  })

  it('fails closed on a partial rerun with missing mandatory jobs', async () => {
    const { request, jobs } = fixtures()
    jobs[0].shift()
    await expect(verifyReleaseChecks(request, sha)).rejects.toThrow('rerun all jobs')
  })

  it('blocks jobs belonging to a different SHA or run', async () => {
    const { request, jobs } = fixtures()
    jobs[0][0].head_sha = 'b'.repeat(40)
    await expect(verifyReleaseChecks(request, sha)).rejects.toThrow('Quality Checks must succeed')
    jobs[0][0].head_sha = sha
    jobs[0][0].run_id = 99
    await expect(verifyReleaseChecks(request, sha)).rejects.toThrow('Quality Checks must succeed')
  })

  it('rechecks the attempt after reading jobs', async () => {
    const { request, runs } = fixtures()
    const original = request.getMockImplementation()!
    request.mockImplementation(async (path: string) => {
      if (path === '/actions/runs/1') return { ...runs[0], run_attempt: 3, status: 'in_progress' }
      return original(path)
    })
    expect(await verifyReleaseChecks(request, sha)).toBe(false)
  })

  it('paginates jobs so an unrelated first page cannot hide a required job', async () => {
    const { request, jobs } = fixtures()
    const original = request.getMockImplementation()!
    request.mockImplementation(async (path: string) => {
      if (path === '/actions/runs/1/attempts/2/jobs?per_page=100&page=1') {
        return { jobs: Array.from({ length: 100 }, (_, id) => ({ ...jobs[0][0], name: `Other ${id}` })) }
      }
      if (path === '/actions/runs/1/attempts/2/jobs?per_page=100&page=2') return { jobs: jobs[0] }
      return original(path)
    })
    expect(await verifyReleaseChecks(request, sha)).toBe(true)
  })
})
