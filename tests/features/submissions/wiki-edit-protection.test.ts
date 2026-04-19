import { describe, expect, it } from 'vitest'
import {
  assessNonOwnerGeometryRisk,
  assessNonOwnerTextRisk,
  combineRiskAssessments,
} from '@/features/submissions/server/submissions/wiki-edit-protection'

describe('wiki edit protection', () => {
  it('blocks non-owner emptying a substantive route description', () => {
    const result = assessNonOwnerTextRisk({
      field: 'route_description',
      previousValue: 'A long established route description with useful sequence and conditions beta.',
      nextValue: null,
    })

    expect(result.riskLevel).toBe('high_risk')
    expect(result.moderationState).toBe('blocked')
    expect(result.reasons).toContain('non_empty_to_empty')
  })

  it('flags substantial description shrink as suspicious', () => {
    const result = assessNonOwnerTextRisk({
      field: 'route_description',
      previousValue: 'Start with a right hand gaston, cross through to the sloper, and finish by rocking over left on the rounded lip.',
      nextValue: 'Right hand, rock over.',
    })

    expect(result.riskLevel).toBe('suspicious')
    expect(result.moderationState).toBe('flagged')
  })

  it('blocks generic route name replacements', () => {
    const result = assessNonOwnerTextRisk({
      field: 'route_name',
      previousValue: 'Baldrick\'s Balderdash',
      nextValue: 'route',
    })

    expect(result.riskLevel).toBe('high_risk')
    expect(result.reasons).toContain('generic_route_name')
  })

  it('blocks major geometry rewrites', () => {
    const result = assessNonOwnerGeometryRisk({
      previousPoints: [{ x: 0.1, y: 0.2 }, { x: 0.2, y: 0.4 }, { x: 0.3, y: 0.7 }],
      nextPoints: [{ x: 0.7, y: 0.1 }, { x: 0.8, y: 0.2 }, { x: 0.9, y: 0.3 }],
    })

    expect(result.riskLevel).toBe('high_risk')
    expect(result.moderationState).toBe('blocked')
  })

  it('flags moderate geometry shifts', () => {
    const result = assessNonOwnerGeometryRisk({
      previousPoints: [{ x: 0.1, y: 0.2 }, { x: 0.2, y: 0.4 }, { x: 0.3, y: 0.7 }],
      nextPoints: [{ x: 0.15, y: 0.25 }, { x: 0.3, y: 0.45 }, { x: 0.45, y: 0.78 }],
    })

    expect(result.riskLevel).toBe('suspicious')
    expect(result.moderationState).toBe('flagged')
  })

  it('elevates combined risk to high risk', () => {
    const result = combineRiskAssessments([
      assessNonOwnerTextRisk({ field: 'route_description', previousValue: 'Useful beta that explains the crux and feet.', nextValue: 'ok' }),
      assessNonOwnerGeometryRisk({
        previousPoints: [{ x: 0.1, y: 0.2 }, { x: 0.2, y: 0.4 }],
        nextPoints: [{ x: 0.7, y: 0.8 }, { x: 0.9, y: 0.9 }],
      }),
    ])

    expect(result.riskLevel).toBe('high_risk')
    expect(result.moderationState).toBe('blocked')
  })
})
