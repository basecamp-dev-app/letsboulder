'use client'

import type { GradeOption } from '@/features/settings/types/settings-content'
import type { GradeSystem } from '@/lib/grade-display'

interface GradeSystemGroupProps {
  title: string
  options: GradeOption[]
  value: GradeSystem
  onChange: (next: GradeSystem) => void
}

interface UnitsSettingsSectionProps {
  units: 'metric' | 'imperial'
  onUnitsChange: (units: 'metric' | 'imperial') => void
  boulderSystem: GradeSystem
  routeSystem: GradeSystem
  tradSystem: GradeSystem
  boulderOptions: GradeOption[]
  routeOptions: GradeOption[]
  tradOptions: GradeOption[]
  onBoulderSystemChange: (next: GradeSystem) => void
  onRouteSystemChange: (next: GradeSystem) => void
  onTradSystemChange: (next: GradeSystem) => void
}

function GradeSystemGroup({ title, options, value, onChange }: GradeSystemGroupProps) {
  return (
    <div className="mb-4">
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-3 py-2 border rounded-lg text-left transition-colors text-xs ${
              value === option.value
                ? 'border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <p className="font-medium">{option.label}</p>
            <p className="text-gray-500 mt-0.5">Ex: {option.sample}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

export function UnitsSettingsSection({
  units,
  onUnitsChange,
  boulderSystem,
  routeSystem,
  tradSystem,
  boulderOptions,
  routeOptions,
  tradOptions,
  onBoulderSystemChange,
  onRouteSystemChange,
  onTradSystemChange,
}: UnitsSettingsSectionProps) {
  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Measurement Units</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Choose your preferred measurement system.</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onUnitsChange('metric')}
            className={`px-4 py-3 border rounded-lg text-left transition-colors ${
              units === 'metric'
                ? 'border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <p className="text-sm font-medium">Metric</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">kg, cm</p>
          </button>
          <button
            type="button"
            onClick={() => onUnitsChange('imperial')}
            className={`px-4 py-3 border rounded-lg text-left transition-colors ${
              units === 'imperial'
                ? 'border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <p className="text-sm font-medium">Imperial</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">lbs, in</p>
          </button>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Grade Display by Climb Type</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Choose how grades are shown for each discipline.</p>

        <GradeSystemGroup
          title="Bouldering"
          options={boulderOptions}
          value={boulderSystem}
          onChange={onBoulderSystemChange}
        />

        <GradeSystemGroup
          title="Sport & Deep Water Solo"
          options={routeOptions}
          value={routeSystem}
          onChange={onRouteSystemChange}
        />

        <GradeSystemGroup
          title="Trad"
          options={tradOptions}
          value={tradSystem}
          onChange={onTradSystemChange}
        />
      </div>
    </div>
  )
}
