'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import MeasuredChartContainer from '@/components/MeasuredChartContainer'
import { formatGradeForDisplay } from '@/lib/grade-display'
import type { GradeSystem } from '@/lib/grades'

interface GradeDistributionChartProps {
  data: Array<{ grade: string; count: number }>
  gradeSystem: GradeSystem
}

export default function GradeDistributionChart({ data, gradeSystem }: GradeDistributionChartProps) {
  return (
    <MeasuredChartContainer className="h-full w-full" minHeightClassName="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
          <XAxis dataKey="grade" tickFormatter={(value: string) => formatGradeForDisplay(value, gradeSystem)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={(value) => typeof value === 'string' ? formatGradeForDisplay(value, gradeSystem) : ''} formatter={(value) => {
            const count = typeof value === 'number' ? value : Number(value || 0)
            return [`${count} climbs`, 'Climbs']
          }} />
          <Bar dataKey="count" fill="#0f766e" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </MeasuredChartContainer>
  )
}
