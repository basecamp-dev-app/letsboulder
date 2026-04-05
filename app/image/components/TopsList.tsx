'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'
import { formatRelativeDate } from './route-detail-utils'

interface RecentTopItem {
  user_id: string
  style: 'top' | 'flash'
  created_at: string
  profile: {
    id: string
    username: string | null
    display_name: string
    avatar_url: string | null
  }
}

interface TopsListProps {
  tops: RecentTopItem[] | null
  loading: boolean
}

export default function TopsList({ tops, loading }: TopsListProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/40 p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-500 dark:text-gray-400" />
      </div>
    )
  }

  if (tops && tops.length > 0) {
    return (
      <div className="space-y-2">
        {tops.map((t) => (
          <Link
            key={`${t.user_id}-${t.created_at}`}
            href={`/logbook/${t.user_id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/40 px-3 py-2 hover:border-gray-300 dark:hover:border-gray-700"
          >
            <div className="flex items-center gap-3 min-w-0">
              {t.profile.avatar_url ? (
                <Image
                  src={t.profile.avatar_url}
                  alt={t.profile.display_name}
                  width={36}
                  height={36}
                  sizes="36px"
                  unoptimized
                  className="w-9 h-9 rounded-full object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-xs text-gray-700 dark:text-gray-200">
                  {t.profile.display_name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{t.profile.display_name}</p>
                <p className="text-xs text-gray-600 dark:text-gray-500">
                  {t.style === 'flash' ? 'Flash' : 'Top'} • {formatRelativeDate(t.created_at)}
                </p>
              </div>
            </div>
            <span className={`text-xs px-2 py-1 rounded border ${
              t.style === 'flash'
                ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800'
                : 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800'
            }`}>
              {t.style === 'flash' ? '⚡' : '✓'}
            </span>
          </Link>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-6">
      <p className="text-sm text-gray-900 dark:text-gray-200">Be the first to log this recently!</p>
      <p className="text-xs text-gray-600 dark:text-gray-500 mt-1">Only public profiles appear here.</p>
    </div>
  )
}
