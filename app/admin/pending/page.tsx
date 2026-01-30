'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { csrfFetch } from '@/hooks/useCsrf'
import { Loader2, Check, X, Eye } from 'lucide-react'

interface PendingImage {
  id: string
  url: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  latitude: number | null
  longitude: number | null
  crag_id: string | null
  crags?: {
    name: string
  } | null
  climbs?: Array<{
    id: string
    name: string | null
    grade: string | null
  }>
  route_count: number
}

export default function PendingPage() {
  const [images, setImages] = useState<PendingImage[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<Record<string, boolean>>({})
  const [previewImage, setPreviewImage] = useState<PendingImage | null>(null)

  useEffect(() => {
    loadPendingImages()
  }, [])

  const loadPendingImages = async () => {
    try {
      const response = await fetch('/api/admin/pending?status=pending')
      if (!response.ok) throw new Error('Failed to load')
      const data = await response.json()
      setImages(data)
    } catch (error) {
      console.error('Error loading pending images:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (imageId: string, newStatus: 'approved' | 'rejected') => {
    if (processing[imageId]) return

    setProcessing(prev => ({ ...prev, [imageId]: true }))
    try {
      const response = await csrfFetch(`/api/admin/images/${imageId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (!response.ok) throw new Error('Failed to update')

      setImages(prev => prev.filter(img => img.id !== imageId))
    } catch (error) {
      console.error('Error updating status:', error)
    } finally {
      setProcessing(prev => ({ ...prev, [imageId]: false }))
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Pending Submissions</h2>
        <p className="text-gray-400">{images.length} images waiting for review</p>
      </div>

      {images.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No pending submissions</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map((image) => (
            <div
              key={image.id}
              className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700"
            >
              <div className="relative h-48 bg-gray-900">
                <button
                  onClick={() => setPreviewImage(image)}
                  className="absolute inset-0 w-full h-full focus:outline-none"
                >
                  <Image
                    src={image.url}
                    alt="Pending submission"
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </button>
                <div className="absolute top-2 right-2">
                  <button
                    onClick={() => setPreviewImage(image)}
                    className="p-1.5 bg-gray-900/80 text-white rounded-lg hover:bg-gray-900 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm text-gray-400">{formatDate(image.created_at)}</p>
                    {image.crags?.name && (
                      <p className="text-white font-medium">{image.crags.name}</p>
                    )}
                  </div>
                  <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                    {image.route_count} route{image.route_count !== 1 ? 's' : ''}
                  </span>
                </div>

                {image.climbs && image.climbs.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-1">Routes:</p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {image.climbs.slice(0, 5).map((climb) => (
                        <div key={climb.id} className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400">{climb.grade}</span>
                          <span className="text-white truncate">{climb.name || 'Unnamed'}</span>
                        </div>
                      ))}
                      {image.climbs.length > 5 && (
                        <p className="text-xs text-gray-500">
                          +{image.climbs.length - 5} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => handleStatusChange(image.id, 'approved')}
                    disabled={processing[image.id]}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleStatusChange(image.id, 'rejected')}
                    disabled={processing[image.id]}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
            <Image
              src={previewImage.url}
              alt="Preview"
              width={1200}
              height={900}
              unoptimized
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{previewImage.crags?.name || 'Unknown crag'}</p>
                <p className="text-gray-400 text-sm">{previewImage.route_count} routes</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    handleStatusChange(previewImage.id, 'approved')
                    setPreviewImage(null)
                  }}
                  disabled={processing[previewImage.id]}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-500 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  Approve
                </button>
                <button
                  onClick={() => {
                    handleStatusChange(previewImage.id, 'rejected')
                    setPreviewImage(null)
                  }}
                  disabled={processing[previewImage.id]}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-500 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
