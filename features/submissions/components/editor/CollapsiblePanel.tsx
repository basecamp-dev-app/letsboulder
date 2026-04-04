'use client'

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsiblePanelProps {
  title: string
  subtitle?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}

export function CollapsiblePanel({ title, subtitle, open, onToggle, children }: CollapsiblePanelProps) {
  return (
    <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  )
}
