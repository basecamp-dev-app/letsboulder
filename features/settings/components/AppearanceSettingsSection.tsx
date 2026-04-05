'use client'

interface AppearanceSettingsSectionProps {
  themePreference: string
  onThemeChange: (theme: string) => void
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
] as const

export function AppearanceSettingsSection({ themePreference, onThemeChange }: AppearanceSettingsSectionProps) {
  return (
    <div className="space-y-6 max-w-xl">
      <p className="text-sm text-gray-500 dark:text-gray-400">Choose your preferred appearance.</p>
      <div className="grid grid-cols-3 gap-2">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onThemeChange(option.value)}
            className={`flex items-center justify-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
              themePreference === option.value
                ? 'border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <span>{option.icon}</span>
            <span className="text-sm font-medium">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
