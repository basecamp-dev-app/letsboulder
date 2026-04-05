'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SettingsTab } from '@/features/settings/types/settings-content'

interface SettingsTabsProps {
  activeTab: string
  tabs: SettingsTab[]
  onTabChange: (tabId: string) => void
}

export function SettingsTabs({ activeTab, tabs, onTabChange }: SettingsTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      <TabsList aria-label="Settings sections">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
