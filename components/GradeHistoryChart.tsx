'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getGradeFromPoints } from '@/lib/grades'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'

interface GradeHistoryChartProps {
  data: Array<{
    month: string
    top: number | null
    flash: number | null
  }>
}

export default function GradeHistoryChart({ data }: GradeHistoryChartProps) {
  const gradeSystem = useGradeSystem()
  const gradeStep = 16
  const values = data.flatMap(d => [d.top, d.flash]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

  const maxValue = values.length > 0 ? Math.max(...values) : 800
  const minValue = values.length > 0 ? Math.min(...values) : 600
  const roundedMin = Math.floor(minValue / gradeStep) * gradeStep
  const roundedMax = Math.ceil(maxValue / gradeStep) * gradeStep

  return (
    <div className="w-full h-64 min-h-[200px] md:min-h-[256px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
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
      </ResponsiveContainer>
    </div>
  )
}
