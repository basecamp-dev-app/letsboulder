import Image from 'next/image'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { HomeRecentCragUpdate } from '@/features/home/server/homepage-data'

function formatRelativeTime(dateString: string) {
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const timestamp = new Date(dateString).getTime()
  const now = Date.now()
  const diffInHours = Math.round((timestamp - now) / (1000 * 60 * 60))

  if (Math.abs(diffInHours) < 24) {
    return formatter.format(diffInHours, 'hour')
  }

  const diffInDays = Math.round(diffInHours / 24)
  if (Math.abs(diffInDays) < 30) {
    return formatter.format(diffInDays, 'day')
  }

  const diffInMonths = Math.round(diffInDays / 30)
  return formatter.format(diffInMonths, 'month')
}

interface HomeRecentCragUpdatesProps {
  updates: HomeRecentCragUpdate[]
}

export default function HomeRecentCragUpdates({ updates }: HomeRecentCragUpdatesProps) {
  if (updates.length === 0) {
    return null
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">New beta coming in</p>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">Recent crag updates</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        {updates.map((update) => (
          <Link key={update.cragId} href={update.href} className="group block">
            <Card className="overflow-hidden border border-stone-200/80 bg-white/95 py-0 dark:border-white/10 dark:bg-slate-950/72">
              <div className="relative aspect-[16/9] overflow-hidden">
                <Image
                  src={update.coverImageUrl}
                  alt={update.cragName}
                  fill
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  className="object-cover transition duration-300 group-hover:scale-[1.03]"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" />
                <div className="absolute bottom-3 left-3 rounded-full border border-white/20 bg-slate-950/75 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                  Updated {formatRelativeTime(update.latestContributionAt)}
                </div>
              </div>
              <CardHeader className="gap-2 px-4 pt-3.5 pb-0 sm:px-5 sm:pt-4">
                <CardTitle className="text-lg leading-tight text-stone-950 dark:text-stone-50">{update.cragName}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3 px-4 pt-0 pb-3.5 sm:px-5 sm:pb-4">
                <p className="text-sm text-stone-600 dark:text-stone-300">
                  {update.recentContributionCount} new {update.recentContributionCount === 1 ? 'topo' : 'topos'} in the latest activity window.
                </p>
                <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-700 transition group-hover:border-stone-300 group-hover:bg-stone-100 dark:border-white/10 dark:bg-slate-900 dark:text-stone-200 dark:group-hover:bg-slate-800">Explore</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
