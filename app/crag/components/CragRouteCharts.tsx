'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'

interface GradeDistributionDatum {
  grade: string
  count: number
}

interface GradeSendDatum {
  grade: string
  sends: number
}

interface CragRouteChartsProps {
  gradeDistribution: GradeDistributionDatum[]
  sendsByGrade: GradeSendDatum[]
}

function formatGradeTooltipLabel(label: unknown, formatter: (grade: string) => string) {
  return typeof label === 'string' ? formatter(label) : ''
}

function formatCountTooltip(value: unknown, label: string) {
  const count = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return [`${count} ${label}${count === 1 ? '' : 's'}`, label.charAt(0).toUpperCase() + label.slice(1)]
}

export default function CragRouteCharts({ gradeDistribution, sendsByGrade }: CragRouteChartsProps) {
  const gradeSystem = useGradeSystem()

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-900 dark:text-gray-100">Grade spread</h3>
            <p className="text-xs text-stone-500 dark:text-gray-400">How the crag stacks by difficulty.</p>
          </div>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gradeDistribution} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
              <XAxis
                dataKey="grade"
                tick={{ fontSize: 12, fill: '#57534e' }}
                tickFormatter={(value: string) => formatGradeForDisplay(value, gradeSystem)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#78716c' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(231, 229, 228, 0.45)' }}
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.96)',
                  border: '1px solid #e7e5e4',
                  borderRadius: '12px',
                  boxShadow: '0 10px 30px rgba(28,25,23,0.08)',
                }}
                formatter={(value) => formatCountTooltip(value, 'route')}
                labelFormatter={(value) => formatGradeTooltipLabel(value, (grade) => formatGradeForDisplay(grade, gradeSystem))}
              />
              <Bar dataKey="count" fill="#0f766e" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-900 dark:text-gray-100">Sends by grade</h3>
            <p className="text-xs text-stone-500 dark:text-gray-400">Where the crag sees the most traffic.</p>
          </div>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sendsByGrade} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
              <XAxis
                dataKey="grade"
                tick={{ fontSize: 12, fill: '#57534e' }}
                tickFormatter={(value: string) => formatGradeForDisplay(value, gradeSystem)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#78716c' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(231, 229, 228, 0.45)' }}
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.96)',
                  border: '1px solid #e7e5e4',
                  borderRadius: '12px',
                  boxShadow: '0 10px 30px rgba(28,25,23,0.08)',
                }}
                formatter={(value) => formatCountTooltip(value, 'send')}
                labelFormatter={(value) => formatGradeTooltipLabel(value, (grade) => formatGradeForDisplay(grade, gradeSystem))}
              />
              <Bar dataKey="sends" fill="#f97316" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
