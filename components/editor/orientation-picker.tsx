'use client'

import { FACE_DIRECTIONS, type FaceDirection } from '@/lib/submission-types'

interface OrientationPickerProps {
  directions: FaceDirection[]
  onToggle: (direction: FaceDirection) => void
}

export function OrientationPicker({ directions, onToggle }: OrientationPickerProps) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {FACE_DIRECTIONS.map((direction) => {
        const selected = directions.includes(direction)
        return (
          <button
            key={direction}
            type="button"
            onClick={() => onToggle(direction)}
            className={`rounded-md border px-2 py-2 text-xs font-semibold transition ${
              selected
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
            }`}
          >
            {direction}
          </button>
        )
      })}
    </div>
  )
}
