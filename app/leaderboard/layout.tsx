import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Climbing Leaderboard',
  description: 'See the most active climbers in Guernsey. Weekly leaderboards tracking sends, flashes, and attempts.',
  openGraph: {
    title: 'Climbing Leaderboard - gsyrocks',
    description: 'See the most active climbers in Guernsey.',
    url: '/leaderboard',
  },
}

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
