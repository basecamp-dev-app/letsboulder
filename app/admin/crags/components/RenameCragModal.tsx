'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import type { Crag } from '@/app/admin/crags/types'

interface RenameCragModalProps {
  crag: Crag
  onClose: () => void
  onSave: (cragId: string, data: { name: string; rock_type: string | null; region_tag: string; sub_area: string | null }) => void
}

const ROCK_TYPES = [
  { value: null, label: 'Unknown' },
  { value: 'granite', label: 'Granite' },
  { value: 'limestone', label: 'Limestone' },
  { value: 'sandstone', label: 'Sandstone' },
  { value: 'basalt', label: 'Basalt' },
  { value: 'slate', label: 'Slate' },
  { value: 'gneiss', label: 'Gneiss' },
  { value: 'schist', label: 'Schist' },
  { value: 'quartzite', label: 'Quartzite' },
  { value: 'dolerite', label: 'Dolerite' },
  { value: 'chalk', label: 'Chalk' },
  { value: 'conglomerate', label: 'Conglomerate' },
  { value: 'tuff', label: 'Tuff' },
  { value: 'other', label: 'Other' },
]

export default function RenameCragModal({ crag, onClose, onSave }: RenameCragModalProps) {
  useOverlayHistory({ open: true, onClose, id: `admin-rename-crag-${crag.id}` })

  const [name, setName] = useState(crag.name)
  const [regionTag, setRegionTag] = useState(crag.region_tag || '')
  const [subArea, setSubArea] = useState(crag.sub_area || '')
  const [rockType, setRockType] = useState(crag.rock_type || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !regionTag.trim()) return

    setSaving(true)
    try {
      await onSave(crag.id, {
        name: name.trim(),
        rock_type: rockType || null,
        region_tag: regionTag.trim(),
        sub_area: subArea.trim() || null,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Edit Crag</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Crag Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="Enter crag name..."
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Region Tag</label>
            <input
              type="text"
              value={regionTag}
              onChange={(e) => setRegionTag(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="e.g. Yosemite Valley"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Sub-area (optional)</label>
            <input
              type="text"
              value={subArea}
              onChange={(e) => setSubArea(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="e.g. Valley S Side"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Rock Type</label>
            <select
              value={rockType}
              onChange={(e) => setRockType(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              {ROCK_TYPES.map((type) => (
                <option key={type.value || 'unknown'} value={type.value || ''}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !regionTag.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
