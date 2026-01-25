'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

interface ImpactCardProps {
  title: string
  value: number
  description?: string
  icon?: React.ReactNode
  trend?: {
    value: number
    label: string
  }
  className?: string
}

export function ImpactCard({
  title,
  value,
  description,
  icon,
  trend,
  className,
}: ImpactCardProps) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const duration = 1500
    const steps = 60
    const increment = value / steps
    const stepDuration = duration / steps

    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= value) {
        setDisplayValue(value)
        clearInterval(timer)
      } else {
        setDisplayValue(Math.floor(current))
      }
    }, stepDuration)

    return () => clearInterval(timer)
  }, [value])

  return (
    <Card
      className={cn(
        'm-0 border-x-0 border-t-0 rounded-none',
        'bg-white dark:bg-gray-950',
        'transition-all duration-300',
        'hover:shadow-md',
        className
      )}
    >
      <CardContent className="pt-6 px-4 md:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {title}
            </p>
            <p className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100">
              {displayValue.toLocaleString()}
            </p>
            {description && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {description}
              </p>
            )}
          </div>
          {icon && (
            <div className="flex-shrink-0 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400">
              {icon}
            </div>
          )}
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1">
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              +{trend.value}%
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {trend.label}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
