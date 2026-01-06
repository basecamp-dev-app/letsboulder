'use client'

interface ProgressRingProps {
  averageGrade: string
  averagePoints: number
  previousGrade: string
  nextGrade: string
  previousGradePoints: number
  nextGradePoints: number
}

export default function ProgressRing({
  averageGrade,
  averagePoints,
  previousGrade,
  nextGrade,
  previousGradePoints,
  nextGradePoints,
}: ProgressRingProps) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const strokeWidth = 4

  const percent = nextGradePoints > previousGradePoints
    ? Math.min(Math.max(((averagePoints - previousGradePoints) / (nextGradePoints - previousGradePoints)) * 100, 0), 100)
    : 0

  const strokeDashoffset = circumference - (percent / 100) * circumference

  return (
    <div className="relative w-28 h-28">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 96 96">
        {/* Background ring */}
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress ring */}
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-gray-800 dark:text-gray-400 transition-all duration-500"
          style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
        />
      </svg>
      
      {/* Average grade in center */}
      <div className="absolute inset-2 flex items-center justify-center">
        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
          {averageGrade}
        </span>
      </div>
      
      {/* Average grade badge */}
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-full shadow-md border border-gray-200 dark:border-gray-700">
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
          Avg
        </span>
      </div>
    </div>
  )
}
