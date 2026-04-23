import Image from 'next/image'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { HomeContributorHighlight, HomeRecentClimbLog } from '@/features/home/server/homepage-data'

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
      />
    )
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700 dark:bg-slate-800 dark:text-stone-100">
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

function formatLogStyle(style: string) {
  if (style === 'flash') return 'Flash'
  if (style === 'top') return 'Top'
  if (style === 'try') return 'Try'
  if (style === 'onsight') return 'Onsight'

  return style.charAt(0).toUpperCase() + style.slice(1)
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
      className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white/90 px-3 py-2.5 transition hover:border-stone-300 hover:bg-white dark:border-white/10 dark:bg-slate-950/55 dark:hover:border-white/20 dark:hover:bg-slate-950/72"
    >
      <Avatar name={contributor.displayName} avatarUrl={contributor.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-950 dark:text-stone-50">{contributor.displayName}</p>
        {contributor.username ? <p className="truncate text-xs text-stone-500 dark:text-stone-400">@{contributor.username}</p> : null}
      </div>
      <div className="shrink-0 text-right">{trailing}</div>
    </Link>
  )
}

interface HomeContributorHighlightsProps {
  recentContributors: HomeContributorHighlight[]
  recentClimbLogs: HomeRecentClimbLog[]
}

export default function HomeContributorHighlights({
  recentContributors,
  recentClimbLogs,
}: HomeContributorHighlightsProps) {
  if (recentContributors.length === 0 && recentClimbLogs.length === 0) {
    return null
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 lg:px-8 lg:pb-18">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        <Card className="border border-stone-200/80 bg-white/92 py-0 dark:border-white/10 dark:bg-slate-950/72">
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

            <div className="rounded-2xl border border-stone-200/80 bg-stone-50/90 p-3 dark:border-white/10 dark:bg-slate-900/80">
              <p className="text-sm text-stone-600 dark:text-stone-300">Share a topo photo and help the next climber find the line.</p>
              <Link
                href="/submit"
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-500 dark:bg-pink-500 dark:hover:bg-pink-400"
              >
                Upload a topo
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-stone-200/80 bg-white/92 py-0 dark:border-white/10 dark:bg-slate-950/72">
          <CardHeader className="px-4 pt-4 pb-0 sm:px-5">
            <CardTitle className="text-lg text-stone-950 dark:text-stone-50">Recent climbs logged</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
            {recentClimbLogs.map((log) => (
              <div
                key={log.logId}
                className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white/90 px-3 py-2.5 transition hover:border-stone-300 hover:bg-white dark:border-white/10 dark:bg-slate-950/55 dark:hover:border-white/20 dark:hover:bg-slate-950/72"
              >
                <Link href={log.profileHref} aria-label={`View ${log.displayName}'s logbook`} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 dark:focus-visible:ring-stone-500 dark:focus-visible:ring-offset-slate-950">
                  <Avatar name={log.displayName} avatarUrl={log.avatarUrl} />
                </Link>
                <Link href={log.href} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 dark:focus-visible:ring-stone-500 dark:focus-visible:ring-offset-slate-950">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-950 dark:text-stone-50">{log.displayName} logged <span className="text-stone-700 dark:text-stone-200">{log.climbName}</span></p>
                    <p className="truncate text-xs text-stone-500 dark:text-stone-400">{log.grade} at {log.cragName}{log.username ? ` • @${log.username}` : ''}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold text-stone-900 dark:text-stone-50">{formatLogStyle(log.style)}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-300">{formatRelativeTime(log.loggedAt)}</p>
                  </div>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
