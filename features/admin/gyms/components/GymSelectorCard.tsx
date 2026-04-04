'use client'

import { Loader2 } from 'lucide-react'
import type { GymListItem } from '@/features/admin/gyms/types'

interface GymSelectorCardProps {
  gyms: GymListItem[]
  selectedGymId: string
  selectedGym: GymListItem | null
  loadingGyms: boolean
  onSelectedGymIdChange: (value: string) => void
}

export default function GymSelectorCard({
  gyms,
  loadingGyms,
  selectedGym,
  selectedGymId,
  onSelectedGymIdChange,
}: GymSelectorCardProps) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Manage floor plan and starter routes</h2>
        {loadingGyms ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : null}
      </div>

      <div className="mt-4 max-w-sm">
        <label className="text-sm text-gray-300">
          Select gym
          <select
            value={selectedGymId}
            onChange={event => onSelectedGymIdChange(event.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
          >
            {gyms.map(gym => (
              <option key={gym.id} value={gym.id}>{gym.name}</option>
            ))}
          </select>
        </label>
      </div>

      {!selectedGym ? (
        <p className="mt-4 text-sm text-gray-400">Create your first gym to configure floor plans and routes.</p>
      ) : (
        <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-4">
          <p className="text-sm text-gray-300">
            <span className="font-semibold text-white">{selectedGym.name}</span>
            {' '}
            • {selectedGym.country_code || 'N/A'} • {selectedGym.active_route_count} active starter routes
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {selectedGym.latitude ?? 'N/A'}, {selectedGym.longitude ?? 'N/A'}
          </p>
        </div>
      )}
    </section>
  )
}
