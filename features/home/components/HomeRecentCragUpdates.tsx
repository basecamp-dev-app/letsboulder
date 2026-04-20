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
    <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">Recent crag updates</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        {updates.map((update) => (
          <Link key={update.cragId} href={update.href} className="group block">
            <Card className="overflow-hidden border-white/60 bg-white/90 py-0 shadow-[0_18px_45px_-24px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src={update.coverImageUrl}
                  alt={update.cragName}
                  fill
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  className="object-cover transition duration-300 group-hover:scale-[1.03]"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" />
                <div className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-slate-950/75 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                  Updated {formatRelativeTime(update.latestContributionAt)}
                </div>
              </div>
              <CardHeader className="gap-3 px-4 pt-4 pb-0 sm:px-5">
                <CardTitle className="text-lg leading-tight text-stone-950 dark:text-stone-50">{update.cragName}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3 px-4 pt-0 pb-4 sm:px-5 sm:pb-5">
                <p className="text-sm text-stone-600 dark:text-stone-300">
                  {update.recentContributionCount} new {update.recentContributionCount === 1 ? 'topo' : 'topos'} in the latest activity window.
                </p>
                <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700 dark:bg-slate-800 dark:text-stone-200">Explore</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
