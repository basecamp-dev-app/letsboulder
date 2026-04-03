export type MeasurementUnits = 'metric' | 'imperial'

const CM_PER_INCH = 2.54

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

export function centimetersToInches(valueCm: number): number {
  return valueCm / CM_PER_INCH
}

export function inchesToCentimeters(valueInches: number): number {
  return valueInches * CM_PER_INCH
}

export function formatLengthInputFromCm(valueCm: number | null | undefined, units: MeasurementUnits): string {
  if (typeof valueCm !== 'number' || !Number.isFinite(valueCm)) return ''
  if (units === 'metric') return String(Math.round(valueCm))
  return String(roundToSingleDecimal(centimetersToInches(valueCm)))
}

export function parseLengthInputToCm(rawValue: string, units: MeasurementUnits): number | null {
  const trimmed = rawValue.trim()
  if (!trimmed) return null

  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) return null

  if (units === 'metric') {
    return Math.round(numeric)
  }

  return Math.round(inchesToCentimeters(numeric))
}

export function formatLengthFromCm(valueCm: number, units: MeasurementUnits): string {
  if (units === 'metric') {
    return `${Math.round(valueCm)} cm`
  }

  const totalInches = Math.round(centimetersToInches(valueCm))
  const feet = Math.floor(totalInches / 12)
  const inches = totalInches % 12
  return `${feet}'${inches}\"`
}

export function getLengthInputLabel(units: MeasurementUnits): string {
  return units === 'metric' ? 'cm' : 'in'
}

export function getLengthInputBounds(units: MeasurementUnits, minCm: number, maxCm: number): { min: number; max: number; step: number } {
  if (units === 'metric') {
    return { min: minCm, max: maxCm, step: 1 }
  }

  return {
    min: roundToSingleDecimal(centimetersToInches(minCm)),
    max: roundToSingleDecimal(centimetersToInches(maxCm)),
    step: 0.5,
  }
}
