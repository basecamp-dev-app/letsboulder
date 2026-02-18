export interface TidePoint {
  dt: number
  height: number
}

export interface TideWindow {
  start: number
  end: number
}

export function buildTidesCacheKey(imageId: string): string {
  return `tides:image:${imageId}:v1`
}

export function interpolateHeight(points: TidePoint[], nowEpochSec: number): number | null {
  if (points.length === 0) return null
  if (points.length === 1) return points[0].height

  const sorted = [...points].sort((a, b) => a.dt - b.dt)

  if (nowEpochSec <= sorted[0].dt) return sorted[0].height
  if (nowEpochSec >= sorted[sorted.length - 1].dt) return sorted[sorted.length - 1].height

  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i]
    const right = sorted[i + 1]
    if (nowEpochSec < left.dt || nowEpochSec > right.dt) continue

    const span = right.dt - left.dt
    if (span <= 0) return left.height
    const ratio = (nowEpochSec - left.dt) / span
    return left.height + (right.height - left.height) * ratio
  }

  return sorted[sorted.length - 1].height
}

export function computeRawAccessWindows(points: TidePoint[], thresholdM: number): TideWindow[] {
  if (points.length === 0) return []
  if (points.length === 1) {
    return points[0].height <= thresholdM
      ? [{ start: points[0].dt, end: points[0].dt }]
      : []
  }

  const sorted = [...points].sort((a, b) => a.dt - b.dt)
  const windows: TideWindow[] = []
  let activeStart: number | null = sorted[0].height <= thresholdM ? sorted[0].dt : null

  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i]
    const right = sorted[i + 1]
    const leftBelow = left.height <= thresholdM
    const rightBelow = right.height <= thresholdM

    if (leftBelow === rightBelow) continue

    const deltaHeight = right.height - left.height
    if (deltaHeight === 0) continue

    const ratio = (thresholdM - left.height) / deltaHeight
    const crossing = left.dt + ratio * (right.dt - left.dt)

    if (leftBelow && !rightBelow) {
      if (activeStart !== null) {
        windows.push({ start: activeStart, end: crossing })
      }
      activeStart = null
    } else if (!leftBelow && rightBelow) {
      activeStart = crossing
    }
  }

  const finalPoint = sorted[sorted.length - 1]
  if (activeStart !== null) {
    windows.push({ start: activeStart, end: finalPoint.dt })
  }

  return windows.filter((window) => window.end > window.start)
}

export function applyWindowBuffer(windows: TideWindow[], bufferMin: number): TideWindow[] {
  const bufferSec = Math.max(0, Math.floor(bufferMin)) * 60
  if (bufferSec === 0) return windows

  return windows
    .map((window) => ({
      start: window.start + bufferSec,
      end: window.end - bufferSec,
    }))
    .filter((window) => window.end > window.start)
}

export function pickNextWindow(windows: TideWindow[], nowEpochSec: number): TideWindow | null {
  const sorted = [...windows].sort((a, b) => a.start - b.start)
  for (const window of sorted) {
    if (window.end > nowEpochSec) {
      return window
    }
  }

  return null
}
