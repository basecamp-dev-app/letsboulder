type TimingExtra = Record<string, unknown>

function roundMs(value: number): number {
  return Math.round(value * 10) / 10
}

export function startServerTiming(label: string) {
  const startedAt = performance.now()

  return {
    step(stepLabel: string, extra?: TimingExtra) {
      const elapsedMs = roundMs(performance.now() - startedAt)
      console.log('[perf]', {
        source: label,
        step: stepLabel,
        elapsedMs,
        ...extra,
      })
    },
    end(extra?: TimingExtra) {
      const elapsedMs = roundMs(performance.now() - startedAt)
      console.log('[perf]', {
        source: label,
        step: 'total',
        elapsedMs,
        ...extra,
      })
    },
  }
}

export async function timeServerStep<T>(label: string, step: string, work: () => Promise<T>): Promise<T> {
  const startedAt = performance.now()
  const result = await work()
  const elapsedMs = roundMs(performance.now() - startedAt)

  let rows: number | undefined
  let bytes: number | undefined
  if (Array.isArray(result)) {
    rows = result.length
    bytes = JSON.stringify(result).length
  }

  console.log('[perf]', {
    source: label,
    step,
    elapsedMs,
    rows,
    bytes,
  })

  return result
}
