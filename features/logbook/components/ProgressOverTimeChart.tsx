'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { getGradeFromPoints, type GradeSystem } from '@/lib/grades'
import { buildProgressChartData, type ProgressRangePreset } from '@/features/logbook/lib/progress-chart'
import type { ProgressLogEntry } from '@/features/logbook/lib/logbook-view'

interface ProgressOverTimeChartProps {
  logs: ProgressLogEntry[]
  gradeSystem: GradeSystem
  range: ProgressRangePreset
}

interface ChartDimensions {
  width: number
  height: number
}

const RANGE_EMPTY_LABELS: Record<Exclude<ProgressRangePreset, 'all'>, string> = {
  '6m': 'last 6 months',
  '1y': 'last year',
  '2y': 'last 2 years',
}

export default function ProgressOverTimeChart({ logs, gradeSystem, range }: ProgressOverTimeChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dimensions, setDimensions] = useState<ChartDimensions | null>(null)

  const chartData = useMemo(() => buildProgressChartData(logs, range), [logs, range])
  const mergedData = chartData.points.map((point) => {
    const trendPoint = chartData.trend.find((entry) => entry.timestamp === point.timestamp)
    return {
      ...point,
      flashAveragePoints: trendPoint?.flashAveragePoints ?? null,
      topAveragePoints: trendPoint?.topAveragePoints ?? null,
    }
  })

  const values = mergedData.flatMap((point) => [point.flashAveragePoints, point.topAveragePoints]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const yDomain: [number, number] = values.length === 0
    ? [400, 700]
    : [Math.max(0, Math.min(...values) - 16), Math.max(...values) + 16]
  const xDomain = chartData.rangeStart === null
    ? ['dataMin', 'dataMax'] as const
    : [chartData.rangeStart, chartData.rangeEnd] as const
  const emptyState = range === 'all'
    ? 'No tops or flashes logged yet.'
    : `No tops or flashes logged in the ${RANGE_EMPTY_LABELS[range]}.`
  const bestGrade = chartData.summary.bestPoints === null
    ? 'None'
    : formatGradeForDisplay(getGradeFromPoints(chartData.summary.bestPoints), gradeSystem)
  const currentFlashAverage = chartData.summary.currentFlashAveragePoints === null
    ? 'None'
    : formatGradeForDisplay(getGradeFromPoints(chartData.summary.currentFlashAveragePoints), gradeSystem)
  const currentTopAverage = chartData.summary.currentTopAveragePoints === null
    ? 'None'
    : formatGradeForDisplay(getGradeFromPoints(chartData.summary.currentTopAveragePoints), gradeSystem)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateDimensions = () => {
      const nextWidth = element.clientWidth
      const nextHeight = element.clientHeight

      if (nextWidth <= 0 || nextHeight <= 0) return

      setDimensions((current) => {
        if (current?.width === nextWidth && current?.height === nextHeight) return current
        return { width: nextWidth, height: nextHeight }
      })
    }

    updateDimensions()

    const observer = new ResizeObserver(() => {
      updateDimensions()
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  if (chartData.points.length === 0) {
    return <p className="py-4 text-gray-500 dark:text-gray-400">{emptyState}</p>
  }

  return (
    <div>
      <dl className="mb-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4 sm:text-sm">
        <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-gray-900">
          <dt className="text-gray-500 dark:text-gray-400">Sends</dt>
          <dd className="font-semibold text-gray-900 dark:text-gray-100">{chartData.summary.sendCount}</dd>
        </div>
        <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-gray-900">
          <dt className="text-gray-500 dark:text-gray-400">Best</dt>
          <dd className="font-semibold text-gray-900 dark:text-gray-100">{bestGrade}</dd>
        </div>
        <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-gray-900">
          <dt className="text-gray-500 dark:text-gray-400">Flash avg</dt>
          <dd className="font-semibold text-gray-900 dark:text-gray-100">{currentFlashAverage}</dd>
        </div>
        <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-gray-900">
          <dt className="text-gray-500 dark:text-gray-400">Top avg</dt>
          <dd className="font-semibold text-gray-900 dark:text-gray-100">{currentTopAverage}</dd>
        </div>
      </dl>
      <div className="h-72 min-h-[240px] w-full min-w-0 md:h-80">
        <div ref={containerRef} className="h-full w-full min-w-0">
          {dimensions ? (
          <LineChart width={dimensions.width} height={dimensions.height} data={mergedData} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="timestamp"
                  domain={xDomain}
                  tick={{ fontSize: 12, fill: '#666' }}
                  axisLine={{ stroke: '#e0e0e0' }}
                  tickLine={false}
                  minTickGap={24}
                  tickFormatter={(value) => new Date(Number(value)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
                />
              <YAxis
                type="number"
                domain={yDomain}
                tick={{ fontSize: 12, fill: '#666' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => formatGradeForDisplay(getGradeFromPoints(value), gradeSystem)}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}
                labelFormatter={(value) => new Date(Number(value)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                formatter={(value, name) => {
                  const label = name === 'flashAveragePoints' ? 'Average flash' : 'Average top'
                  return [formatGradeForDisplay(getGradeFromPoints(Number(value)), gradeSystem), label]
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: 8 }}
                formatter={(value) => {
                  if (value === 'flashAveragePoints') return 'Average flash'
                  if (value === 'topAveragePoints') return 'Average top'
                  return value
                }}
              />
              <Line
                type="linear"
                dataKey="flashAveragePoints"
                stroke="#4b5563"
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: '#4b5563', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
                name="flashAveragePoints"
              />
              <Line
                type="linear"
                dataKey="topAveragePoints"
                stroke="#111111"
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: '#111111', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
                name="topAveragePoints"
              />
            </LineChart>
          ) : (
            <div className="h-full w-full" />
          )}
        </div>
      </div>
    </div>
  )
}
