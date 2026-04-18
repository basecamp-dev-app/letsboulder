'use client'

import { useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { getGradeFromPoints } from '@/lib/grades'
import { useGradeSystem } from '@/features/grades/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'

interface GradeHistoryChartProps {
  data: Array<{
    month: string
    top: number | null
    flash: number | null
  }>
}

interface ChartDimensions {
  width: number
  height: number
}

export default function GradeHistoryChart({ data }: GradeHistoryChartProps) {
  const gradeSystem = useGradeSystem()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dimensions, setDimensions] = useState<ChartDimensions | null>(null)
  const gradeStep = 16
  const values = data.flatMap((entry) => [entry.top, entry.flash]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  const maxValue = values.length > 0 ? Math.max(...values) : 800
  const minValue = values.length > 0 ? Math.min(...values) : 600
  const roundedMin = Math.floor(minValue / gradeStep) * gradeStep
  const roundedMax = Math.ceil(maxValue / gradeStep) * gradeStep
  const chartData = data.map((entry) => ({
    ...entry,
    topDisplay: entry.top,
    flashDisplay: entry.flash,
  }))

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateDimensions = () => {
      const nextWidth = element.clientWidth
      const nextHeight = element.clientHeight

      if (nextWidth <= 0 || nextHeight <= 0) return

      setDimensions((current) => {
        if (current?.width === nextWidth && current?.height === nextHeight) {
          return current
        }

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

  return (
    <div className="w-full min-w-0 h-64 min-h-[200px] md:min-h-[256px]">
      <div ref={containerRef} className="h-full w-full min-w-0">
        {dimensions ? (
          <LineChart
            width={dimensions.width}
            height={dimensions.height}
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: '#666' }}
              axisLine={{ stroke: '#e0e0e0' }}
              tickLine={false}
            />
            <YAxis
              domain={[roundedMin, roundedMax]}
              tick={{ fontSize: 12, fill: '#666' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => formatGradeForDisplay(getGradeFromPoints(value), gradeSystem)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
              labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              itemStyle={{ fontSize: 13 }}
              formatter={(value) => {
                if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
                return formatGradeForDisplay(getGradeFromPoints(value), gradeSystem)
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: 8 }}
              iconType="circle"
              formatter={(value) => {
                if (value === 'flashDisplay') {
                  return 'Flash'
                }
                if (value === 'topDisplay') {
                  return 'Top'
                }
                return value.charAt(0).toUpperCase() + value.slice(1)
              }}
            />
            <Line
              type="monotone"
              dataKey="flashDisplay"
              stroke="#666666"
              strokeWidth={3}
              name="flashDisplay"
              animationDuration={300}
              connectNulls={false}
              dot={{ r: 4, fill: '#666666', strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="topDisplay"
              stroke="#111111"
              strokeWidth={3}
              name="topDisplay"
              animationDuration={300}
              connectNulls={false}
              dot={{ r: 4, fill: '#111111', strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        ) : (
          <div className="h-full w-full" />
        )}
      </div>
    </div>
  )
}
