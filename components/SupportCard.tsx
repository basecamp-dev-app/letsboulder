import { Heart, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  MONTHLY_SUPPORT_CURRENT_USD,
  MONTHLY_SUPPORT_TARGET_USD,
  MONTHLY_SUPPORT_UPDATED_LABEL,
  SUPPORT_URL,
} from '@/lib/site'

interface SupportCardProps {
  compact?: boolean
}

export default function SupportCard({ compact = false }: SupportCardProps) {
  const progress = Math.min(
    100,
    Math.round((MONTHLY_SUPPORT_CURRENT_USD / Math.max(MONTHLY_SUPPORT_TARGET_USD, 1)) * 100),
  )

  return (
    <Card id="support" className="border-emerald-200 bg-gradient-to-br from-white via-emerald-50/60 to-stone-50 dark:border-emerald-900/60 dark:from-gray-900 dark:via-emerald-950/30 dark:to-gray-900">
      <CardHeader className={compact ? 'pb-3' : 'pb-4'}>
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <Heart className="h-4 w-4" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em]">Keep it free</h2>
        </div>
        <CardTitle className={compact ? 'text-lg' : 'text-2xl'}>
          Help keep letsboulder ad-free
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? 'space-y-4' : 'space-y-5'}>
        <div className="rounded-xl border border-emerald-100 bg-white/80 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-gray-950/50">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-gray-900 dark:text-gray-100">Monthly server costs</span>
            <span className="text-gray-600 dark:text-gray-400">${MONTHLY_SUPPORT_CURRENT_USD} / ${MONTHLY_SUPPORT_TARGET_USD}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Updated manually. Last check: {MONTHLY_SUPPORT_UPDATED_LABEL}.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Buy the dev a bag of chalk on Ko-fi.
          </p>
          <Button asChild className="bg-emerald-600 text-white hover:bg-emerald-700">
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Donate on Ko-fi (opens in a new tab)"
            >
              Donate on Ko-fi
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
