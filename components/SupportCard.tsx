import { Heart, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  MONTHLY_SUPPORT_TARGET_USD,
  SUPPORT_URL,
} from '@/lib/site'

interface SupportCardProps {
  compact?: boolean
}

export default function SupportCard({ compact = false }: SupportCardProps) {
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
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Monthly infrastructure target</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">${MONTHLY_SUPPORT_TARGET_USD}</p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            This is the operating target, not a live total of donations received.
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
