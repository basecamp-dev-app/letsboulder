'use client'

import { Loader2, Plus } from 'lucide-react'
import AdminGymLocationPicker from '@/features/admin/gyms/components/AdminGymLocationPicker'
import { DISCIPLINE_OPTIONS, formatDiscipline } from '@/features/admin/gyms/types'
import type { GymDiscipline } from '@/features/admin/gyms/types'

interface CreateGymFormProps {
  gymName: string
  gymLocation: { latitude: number; longitude: number } | null
  gymDisciplines: GymDiscipline[]
  gymPrimaryDiscipline: GymDiscipline
  creatingGym: boolean
  onGymNameChange: (value: string) => void
  onGymLocationChange: (value: { latitude: number; longitude: number } | null) => void
  onGymPrimaryDisciplineChange: (value: GymDiscipline) => void
  onToggleGymDiscipline: (value: GymDiscipline) => void
  onCreateGym: () => void
}

export default function CreateGymForm({
  gymDisciplines,
  gymLocation,
  gymName,
  gymPrimaryDiscipline,
  creatingGym,
  onCreateGym,
  onGymLocationChange,
  onGymNameChange,
  onGymPrimaryDisciplineChange,
  onToggleGymDiscipline,
}: CreateGymFormProps) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-lg font-semibold text-white">Create gym place</h2>
      <div className="mt-4 space-y-3">
        <input
          value={gymName}
          onChange={event => onGymNameChange(event.target.value)}
          placeholder="Gym name"
          className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder-gray-500"
        />
        <div>
          <p className="mb-2 text-sm text-gray-300">Place gym pin</p>
          <AdminGymLocationPicker value={gymLocation} onChange={onGymLocationChange} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm text-gray-300">Disciplines</p>
          <div className="grid grid-cols-2 gap-2">
            {DISCIPLINE_OPTIONS.map(option => (
              <label key={option.value} className="flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={gymDisciplines.includes(option.value)}
                  onChange={() => onToggleGymDiscipline(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <label className="text-sm text-gray-300">
          Primary discipline
          <select
            value={gymPrimaryDiscipline}
            onChange={event => onGymPrimaryDisciplineChange(event.target.value as GymDiscipline)}
            className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
          >
            {gymDisciplines.map(discipline => (
              <option key={discipline} value={discipline}>{formatDiscipline(discipline)}</option>
            ))}
          </select>
        </label>
      </div>

      <button
        onClick={onCreateGym}
        disabled={creatingGym || !gymLocation || !gymName.trim()}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
      >
        {creatingGym ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Create gym
      </button>
    </section>
  )
}
