'use client'

import { useEffect, useRef, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
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
          <AreaChart
            width={dimensions.width}
            height={dimensions.height}
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="flashGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#666666" stopOpacity={0.6}/>
                <stop offset="95%" stopColor="#666666" stopOpacity={0.15}/>
              </linearGradient>
              <linearGradient id="topGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#444444" stopOpacity={0.7}/>
                <stop offset="95%" stopColor="#444444" stopOpacity={0.2}/>
              </linearGradient>
            </defs>
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
                if (value === 'flash') {
                  return 'Flash'
                }
                return value.charAt(0).toUpperCase() + value.slice(1)
              }}
            />
            <Area
              type="monotone"
              dataKey="flash"
              stroke="#666666"
              strokeWidth={2}
              fill="url(#flashGradient)"
              name="flash"
              animationDuration={300}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="top"
              stroke="#333333"
              strokeWidth={2}
              fill="url(#topGradient)"
              name="top"
              animationDuration={300}
              connectNulls={false}
            />
          </AreaChart>
        ) : (
          <div className="h-full w-full" />
        )}
      </div>
    </div>
  )
}
