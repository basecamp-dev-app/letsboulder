import Image from 'next/image'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { HomeContributorHighlight } from '@/features/home/server/homepage-data'

function formatRelativeTime(dateString: string) {
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const timestamp = new Date(dateString).getTime()
  const now = Date.now()
  const diffInHours = Math.round((timestamp - now) / (1000 * 60 * 60))

  if (Math.abs(diffInHours) < 24) {
    return formatter.format(diffInHours, 'hour')
  }

  const diffInDays = Math.round(diffInHours / 24)
  return formatter.format(diffInDays, 'day')
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={40}
        height={40}
        sizes="40px"
        className="h-10 w-10 rounded-full object-cover"
        unoptimized
      />
    )
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700 dark:bg-slate-800 dark:text-stone-100">
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

function ContributorRow({
  contributor,
  trailing,
}: {
  contributor: HomeContributorHighlight
  trailing: React.ReactNode
}) {
  return (
    <Link
      href={contributor.href}
      className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white/85 px-3 py-3 transition hover:border-stone-300 hover:bg-white dark:border-white/10 dark:bg-slate-950/50 dark:hover:border-white/20 dark:hover:bg-slate-950/70"
    >
      <Avatar name={contributor.displayName} avatarUrl={contributor.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-950 dark:text-stone-50">{contributor.displayName}</p>
        <p className="truncate text-xs text-stone-500 dark:text-stone-400">{contributor.username ? `@${contributor.username}` : 'Public profile'}</p>
      </div>
      <div className="shrink-0 text-right">{trailing}</div>
    </Link>
  )
}

interface HomeContributorHighlightsProps {
  recentContributors: HomeContributorHighlight[]
  topContributors: HomeContributorHighlight[]
}

export default function HomeContributorHighlights({
  recentContributors,
  topContributors,
}: HomeContributorHighlightsProps) {
  if (recentContributors.length === 0 && topContributors.length === 0) {
    return null
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 lg:px-8 lg:pb-20">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Community credit</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">Public contributors shaping the map</h2>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="border-white/60 bg-white/88 py-0 shadow-[0_18px_45px_-24px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
          <CardHeader className="px-4 pt-4 pb-0 sm:px-5">
            <CardTitle className="text-lg text-stone-950 dark:text-stone-50">Recent contributors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
            {recentContributors.map((contributor) => (
              <ContributorRow
                key={contributor.userId}
                contributor={contributor}
                trailing={<p className="text-xs font-medium text-stone-500 dark:text-stone-300">{contributor.contributedAt ? formatRelativeTime(contributor.contributedAt) : 'Recently'}</p>}
              />
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/88 py-0 shadow-[0_18px_45px_-24px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
          <CardHeader className="px-4 pt-4 pb-0 sm:px-5">
            <CardTitle className="text-lg text-stone-950 dark:text-stone-50">Top contributors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
            {topContributors.map((contributor) => (
              <ContributorRow
                key={contributor.userId}
                contributor={contributor}
                trailing={(
                  <>
                    <p className="text-xs font-semibold text-stone-900 dark:text-stone-50">{contributor.contributorScoreTotal ?? 0} score</p>
                    <p className="text-xs text-stone-500 dark:text-stone-300">{contributor.acceptedContributionCount ?? 0} accepted</p>
                  </>
                )}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
