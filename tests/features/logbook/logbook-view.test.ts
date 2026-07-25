import { describe, expect, it } from 'vitest'

import {
  getLogbookStats,
  getRecentLogbookLogs,
  type LogbookClimb,
  type ProgressLogEntry,
} from '@/features/logbook/lib/logbook-view'

function makeDetailedLog(index: number): LogbookClimb {
  return {
    id: `log-${index}`,
    climb_id: `climb-${index}`,
    style: 'top',
    created_at: new Date().toISOString(),
    climbs: {
      id: `climb-${index}`,
      name: `Climb ${index}`,
      grade: '6A',
      crags: { name: 'Test crag' },
    },
  }
}

describe('logbook view helpers', () => {
  it('calculates display statistics from lightweight progress rows', () => {
    const logs: ProgressLogEntry[] = [
      {
        id: 'flash-log',
        climb_id: 'flash-climb',
        style: 'flash',
        created_at: new Date().toISOString(),
        climbs: { id: 'flash-climb', name: 'Flash climb', grade: '7A' },
      },
      {
        id: 'top-log',
        climb_id: 'top-climb',
        style: 'top',
        created_at: new Date().toISOString(),
        climbs: { id: 'top-climb', name: 'Top climb', grade: '6B' },
      },
    ]

    const stats = getLogbookStats(logs)

    expect(stats?.top10Hardest).toHaveLength(2)
    expect(stats?.totalFlashes).toBe(1)
    expect(stats?.totalTops).toBe(1)
  })

  it('uses exact lifetime counts without changing range-based statistics', () => {
    const logs: ProgressLogEntry[] = [{
      id: 'recent-log',
      climb_id: 'recent-climb',
      style: 'flash',
      created_at: new Date().toISOString(),
      climbs: { id: 'recent-climb', name: 'Recent climb', grade: '7A' },
    }]

    const stats = getLogbookStats(logs, {
      totalClimbs: 2501,
      totalFlashes: 700,
      totalTops: 1500,
      totalTries: 301,
    })

    expect(stats?.totalClimbs).toBe(2501)
    expect(stats?.totalFlashes).toBe(700)
    expect(stats?.totalTops).toBe(1500)
    expect(stats?.totalTries).toBe(301)
    expect(stats?.top10Hardest).toHaveLength(1)
  })

  it('keeps every detailed row loaded into history', () => {
    const logs = Array.from({ length: 48 }, (_, index) => makeDetailedLog(index))

    expect(getRecentLogbookLogs(logs)).toEqual(logs)
  })
})
