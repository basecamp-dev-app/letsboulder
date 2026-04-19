type RiskLevel = 'safe' | 'suspicious' | 'high_risk'
type ModerationState = 'accepted' | 'flagged' | 'blocked'

interface RiskAssessment {
  riskLevel: RiskLevel
  moderationState: ModerationState
  reasons: string[]
  fieldTargets: string[]
}

interface TextRiskInput {
  field: string
  previousValue: string | null
  nextValue: string | null
}

interface RouteGeometryRiskInput {
  previousPoints: Array<{ x: number; y: number }> | null
  nextPoints: Array<{ x: number; y: number }> | null
}

const GENERIC_NAME_VALUES = new Set(['route', 'unknown', 'test', 'todo', 'line'])

function trimmedLength(value: string | null): number {
  return value?.trim().length ?? 0
}

function normalizedValue(value: string | null): string {
  return value?.trim().toLowerCase() ?? ''
}

export function assessNonOwnerTextRisk(input: TextRiskInput): RiskAssessment {
  const previousLength = trimmedLength(input.previousValue)
  const nextLength = trimmedLength(input.nextValue)
  const fieldTargets = [input.field]
  const reasons: string[] = []

  if (previousLength > 0 && nextLength === 0) {
    return { riskLevel: 'high_risk', moderationState: 'blocked', reasons: ['non_empty_to_empty'], fieldTargets }
  }

  if (input.field === 'route_name' && previousLength > 0 && GENERIC_NAME_VALUES.has(normalizedValue(input.nextValue))) {
    return { riskLevel: 'high_risk', moderationState: 'blocked', reasons: ['generic_route_name'], fieldTargets }
  }

  if (previousLength >= 40 && nextLength > 0 && nextLength < 15) {
    return { riskLevel: 'high_risk', moderationState: 'blocked', reasons: ['substantive_to_trivial'], fieldTargets }
  }

  if (previousLength >= 80 && nextLength > 0 && nextLength < Math.ceil(previousLength * 0.5)) {
    reasons.push('substantive_shrink')
  }

  if (previousLength >= 20 && nextLength > 0 && nextLength < Math.ceil(previousLength * 0.35)) {
    reasons.push('aggressive_shrink')
  }

  if (reasons.length > 0) {
    return { riskLevel: 'suspicious', moderationState: 'flagged', reasons, fieldTargets }
  }

  return { riskLevel: 'safe', moderationState: 'accepted', reasons: [], fieldTargets }
}

export function assessNonOwnerGeometryRisk(input: RouteGeometryRiskInput): RiskAssessment {
  if (!input.previousPoints || !input.nextPoints || input.previousPoints.length < 2 || input.nextPoints.length < 2) {
    return { riskLevel: 'safe', moderationState: 'accepted', reasons: [], fieldTargets: ['route_geometry'] }
  }

  const pointCountDelta = Math.abs(input.previousPoints.length - input.nextPoints.length)
  const sampleCount = Math.min(input.previousPoints.length, input.nextPoints.length)
  let totalDisplacement = 0

  for (let index = 0; index < sampleCount; index += 1) {
    const previous = input.previousPoints[index]
    const next = input.nextPoints[index]
    const dx = previous.x - next.x
    const dy = previous.y - next.y
    totalDisplacement += Math.sqrt((dx * dx) + (dy * dy))
  }

  const averageDisplacement = sampleCount > 0 ? totalDisplacement / sampleCount : 0
  const startDisplacement = Math.sqrt(
    ((input.previousPoints[0]?.x ?? 0) - (input.nextPoints[0]?.x ?? 0)) ** 2 +
    ((input.previousPoints[0]?.y ?? 0) - (input.nextPoints[0]?.y ?? 0)) ** 2
  )
  const endDisplacement = Math.sqrt(
    ((input.previousPoints[input.previousPoints.length - 1]?.x ?? 0) - (input.nextPoints[input.nextPoints.length - 1]?.x ?? 0)) ** 2 +
    ((input.previousPoints[input.previousPoints.length - 1]?.y ?? 0) - (input.nextPoints[input.nextPoints.length - 1]?.y ?? 0)) ** 2
  )

  if (averageDisplacement > 0.35 || startDisplacement > 0.45 || endDisplacement > 0.45) {
    return { riskLevel: 'high_risk', moderationState: 'blocked', reasons: ['geometry_replaced'], fieldTargets: ['route_geometry'] }
  }

  if (averageDisplacement > 0.12 || pointCountDelta >= 4 || startDisplacement > 0.12 || endDisplacement > 0.12) {
    return { riskLevel: 'suspicious', moderationState: 'flagged', reasons: ['geometry_shifted'], fieldTargets: ['route_geometry'] }
  }

  return { riskLevel: 'safe', moderationState: 'accepted', reasons: [], fieldTargets: ['route_geometry'] }
}

export function combineRiskAssessments(assessments: RiskAssessment[]): RiskAssessment {
  const reasons = Array.from(new Set(assessments.flatMap((assessment) => assessment.reasons)))
  const fieldTargets = Array.from(new Set(assessments.flatMap((assessment) => assessment.fieldTargets)))

  if (assessments.some((assessment) => assessment.riskLevel === 'high_risk')) {
    return { riskLevel: 'high_risk', moderationState: 'blocked', reasons, fieldTargets }
  }

  if (assessments.some((assessment) => assessment.riskLevel === 'suspicious')) {
    return { riskLevel: 'suspicious', moderationState: 'flagged', reasons, fieldTargets }
  }

  return { riskLevel: 'safe', moderationState: 'accepted', reasons, fieldTargets }
}

export type { ModerationState, RiskAssessment, RiskLevel }
