'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface GradeHistoryChartProps {
  data: Array<{
    month: string
    top: number
    flash: number
  }>
}

export default function GradeHistoryChart({ data }: GradeHistoryChartProps) {
  // Calculate Y-axis domain
  const maxValue = Math.max(...data.map(d => Math.max(d.top, d.flash)), 800)
  const domainMin = Math.min(...data.map(d => Math.min(d.top, d.flash)), 600)
  const roundedMin = Math.floor(domainMin / 50) * 50

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
            domain={[roundedMin, Math.ceil(maxValue / 50) * 50]}
            tick={{ fontSize: 12, fill: '#666' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => value.toString()}
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
          />
          <Legend
            wrapperStyle={{ paddingTop: 8 }}
            iconType="circle"
            formatter={(value) => {
              if (value === 'flash') {
                return (
                  <span className="flex items-center gap-1">
                    <span>Flash</span>
                    <span>⚡</span>
                  </span>
                )
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
          />
          <Area
            type="monotone"
            dataKey="top"
            stroke="#333333"
            strokeWidth={2}
            fill="url(#topGradient)"
            name="top"
            animationDuration={300}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
