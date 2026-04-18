'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ComposedChart, CartesianGrid, Legend, Line, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { getGradeFromPoints, type GradeSystem } from '@/lib/grades'
import { buildProgressChartData, type ProgressRangePreset } from '@/features/logbook/lib/progress-chart'
import type { LogbookClimb } from '@/features/logbook/lib/logbook-view'

interface ProgressOverTimeChartProps {
  logs: LogbookClimb[]
  gradeSystem: GradeSystem
}

interface ChartDimensions {
  width: number
  height: number
}

const RANGE_OPTIONS: Array<{ id: ProgressRangePreset; label: string }> = [
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
  { id: '2y', label: '2Y' },
  { id: 'all', label: 'All' },
]

export default function ProgressOverTimeChart({ logs, gradeSystem }: ProgressOverTimeChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dimensions, setDimensions] = useState<ChartDimensions | null>(null)
  const [range, setRange] = useState<ProgressRangePreset>('1y')

  const chartData = useMemo(() => buildProgressChartData(logs, range), [logs, range])
  const mergedData = chartData.points.map((point) => {
    const trendPoint = chartData.trend.find((entry) => entry.timestamp === point.timestamp)
    return {
      ...point,
      averagePoints: trendPoint?.averagePoints ?? null,
    }
  })

  const values = mergedData.flatMap((point) => [point.flashPoints, point.topPoints, point.averagePoints]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const yDomain: [number, number] = values.length === 0
    ? [400, 700]
    : [Math.max(0, Math.min(...values) - 16), Math.max(...values) + 16]

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
    return <p className="py-4 text-gray-500 dark:text-gray-400">No tops or flashes logged for this range yet.</p>
  }

  return (
    <div className="space-y-3">
      <Tabs value={range} onValueChange={(value) => setRange(value as ProgressRangePreset)}>
        <TabsList className="border-0 px-0 py-0">
          {RANGE_OPTIONS.map((option) => (
            <TabsTrigger key={option.id} value={option.id} className="min-h-9 px-3 py-1.5 text-xs sm:text-sm">
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="text-sm text-gray-500 dark:text-gray-400">
        Dots show individual tops and flashes. The line shows your 60-day average.
      </div>

      <div className="h-72 min-h-[240px] w-full min-w-0 md:h-80">
        <div ref={containerRef} className="h-full w-full min-w-0">
          {dimensions ? (
            <ComposedChart width={dimensions.width} height={dimensions.height} data={mergedData} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                type="number"
                dataKey="timestamp"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 12, fill: '#666' }}
                axisLine={{ stroke: '#e0e0e0' }}
                tickLine={false}
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
                formatter={(value, name, item) => {
                  if (name === 'averagePoints') {
                    return [formatGradeForDisplay(getGradeFromPoints(Number(value)), gradeSystem), '60-day average']
                  }

                  const payload = item.payload as { style: 'flash' | 'top'; grade: string; climbName: string | null }
                  const label = payload.style === 'flash' ? 'Flash' : 'Top'
                  const routeName = payload.climbName ? `${payload.climbName} • ` : ''
                  return [`${routeName}${formatGradeForDisplay(payload.grade, gradeSystem)}`, label]
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: 8 }}
                formatter={(value) => {
                  if (value === 'flashPoints') return 'Flash ascents'
                  if (value === 'topPoints') return 'Top ascents'
                  if (value === 'averagePoints') return '60-day average'
                  return value
                }}
              />
              <Line
                type="linear"
                dataKey="averagePoints"
                stroke="#111111"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                name="averagePoints"
              />
              <Scatter name="flashPoints" dataKey="flashPoints" fill="#4b5563" shape="circle" />
              <Scatter name="topPoints" dataKey="topPoints" fill="#111111" shape="diamond" />
            </ComposedChart>
          ) : (
            <div className="h-full w-full" />
          )}
        </div>
      </div>
    </div>
  )
}
