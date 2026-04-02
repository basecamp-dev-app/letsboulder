'use client'

import { ArrowRightLeft, Edit2, Mountain, Trash2 } from 'lucide-react'
import type { AdminCrag } from '@/app/admin/crags/types'
import { formatRouteTypeLabel } from '@/app/admin/crags/types'

interface CragsTableProps {
  crags: AdminCrag[]
  onMoveImage: (crag: AdminCrag) => void
  onRename: (crag: AdminCrag) => void
  onDelete: (crag: AdminCrag) => void
}

export default function CragsTable({ crags, onDelete, onMoveImage, onRename }: CragsTableProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-800">
          <tr>
            <th className="text-left px-4 py-3 text-gray-400 font-medium text-sm">Crag Name</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium text-sm">Location</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium text-sm">Type</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium text-sm">Rock</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium text-sm">Climbs</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium text-sm">Images</th>
            <th className="text-right px-4 py-3 text-gray-400 font-medium text-sm">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {crags.map((crag) => (
            <tr key={crag.id} className="hover:bg-gray-800/50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Mountain className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-white font-medium">{crag.name}</p>
                    <p className="text-xs text-gray-500">
                      {crag.latitude != null && crag.longitude != null
                        ? `${crag.latitude.toFixed(4)}, ${crag.longitude.toFixed(4)}`
                        : 'No coordinates'}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {crag.has_primary_region_tag && crag.region_tag ? (
                    <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded">
                      Region: {crag.region_tag}
                    </span>
                  ) : crag.region_tag ? (
                    <span className="px-2 py-1 bg-amber-900/50 text-amber-300 text-xs rounded">
                      Unlinked Region: {crag.region_tag}
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-red-900/40 text-red-300 text-xs rounded">
                      Missing region tag
                    </span>
                  )}
                  {crag.sub_area ? (
                    <span className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded">
                      Sub-area: {crag.sub_area}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="px-2 py-1 bg-blue-900/50 text-blue-400 text-xs rounded capitalize">
                  {crag.route_type_counts && crag.route_type_counts.length > 0
                    ? crag.route_type_counts.map((entry) => `${formatRouteTypeLabel(entry.type)} (${entry.count})`).join(' · ')
                    : (crag.type ? formatRouteTypeLabel(crag.type) : 'N/A')}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded capitalize">
                  {crag.rock_type || 'N/A'}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-300">{crag.climb_count}</td>
              <td className="px-4 py-3 text-gray-300">{crag.image_count}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => onMoveImage(crag)}
                    className="p-2 text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
                    title="Move published route image"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onRename(crag)}
                    className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                    title="Rename"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(crag)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
