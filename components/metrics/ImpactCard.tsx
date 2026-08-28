import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ImpactCardProps {
  title: string
  value: number | null
  description?: string
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
  trend,
  className,
}: ImpactCardProps) {
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
        <div className="space-y-1">
          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {title}
          </dt>
          <dd className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100">
            {value === null ? (
              <span className="text-xl md:text-2xl">Temporarily unavailable</span>
            ) : value.toLocaleString()}
          </dd>
          {description && (
            <dd className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {description}
            </dd>
          )}
        </div>
        {trend && (
          <dd className="mt-3 flex items-center gap-1">
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              +{trend.value}%
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {trend.label}
            </span>
          </dd>
        )}
      </CardContent>
    </Card>
  )
}
