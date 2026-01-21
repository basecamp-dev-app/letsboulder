'use client'

import { GRADES } from '@/lib/grades'

interface GradePyramidProps {
  pyramid: Record<string, number>
  lowestGrade: string
}

export default function GradePyramid({ pyramid, lowestGrade }: GradePyramidProps) {
  // Filter grades from lowest to highest, starting from user's lowest grade
  const displayGrades = GRADES.slice(GRADES.indexOf(lowestGrade))
  
  // Find max count for scaling
  const maxCount = Math.max(...displayGrades.map(g => pyramid[g] || 0), 1)

  return (
    <div className="w-full min-h-[200px]">
      <div className="flex flex-col-reverse items-center gap-2 md:gap-1">
        {displayGrades.map((grade) => {
          const count = pyramid[grade] || 0
          const widthPercent = maxCount > 0 ? (count / maxCount) * 100 : 0
          const width = Math.max(widthPercent, 5)

          return (
            <div key={grade} className="flex items-center gap-3 w-full">
              <span className="text-sm md:text-xs text-gray-600 dark:text-gray-400 w-12 text-right">
                {grade}
              </span>
              <div className="flex-1 h-8 md:h-6 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                <div
                  className="h-full bg-gray-600 dark:bg-gray-500 rounded transition-all duration-300"
                  style={{ width: `${width}%`, minWidth: count > 0 ? '8px' : '0' }}
                />
              </div>
              <span className="text-sm md:text-xs text-gray-500 dark:text-gray-400 w-6 text-left">
                {count > 0 ? count : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
