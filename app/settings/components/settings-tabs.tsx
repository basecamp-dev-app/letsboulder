'use client'

import type { SettingsTab } from '@/app/settings/components/settings-content.types'

interface SettingsTabsProps {
  activeTab: string
  tabs: SettingsTab[]
  onTabChange: (tabId: string) => void
}

export function SettingsTabs({ activeTab, tabs, onTabChange }: SettingsTabsProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <nav className="flex -mb-px overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-white'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
