'use client'

import { HelpCircle } from 'lucide-react'

type LogStyle = 'flash' | 'top' | 'try'

interface LogButtonsProps {
  logging: boolean
  userLogStyle: string | undefined
  onLog: (style: LogStyle) => Promise<void>
  onInfoOpen: () => void
}

export default function LogButtons({ logging, userLogStyle, onLog, onInfoOpen }: LogButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onLog('flash')}
        disabled={logging}
        className={`flex-1 py-2 rounded-lg font-medium transition-colors border ${
          userLogStyle === 'flash'
            ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800'
            : 'bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
        } disabled:opacity-60`}
      >
        Flash
      </button>
      <button
        onClick={() => onLog('top')}
        disabled={logging}
        className={`flex-1 py-2 rounded-lg font-medium transition-colors border ${
          userLogStyle === 'top'
            ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800'
            : 'bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
        } disabled:opacity-60`}
      >
        Top
      </button>
      <button
        onClick={() => onLog('try')}
        disabled={logging}
        className={`flex-1 py-2 rounded-lg font-medium transition-colors border ${
          userLogStyle === 'try'
            ? 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800'
            : 'bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
        } disabled:opacity-60`}
      >
        Try
      </button>
      <button
        onClick={onInfoOpen}
        className="shrink-0 p-2 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900"
        aria-label="Log types info"
      >
        <HelpCircle className="w-4 h-4 text-gray-700 dark:text-gray-200" />
      </button>
    </div>
  )
}
