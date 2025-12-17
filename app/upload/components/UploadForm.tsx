'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.size > 16 * 1024 * 1024) {
        setError('File size must be less than 16MB')
        return
      }
      if (!selectedFile.type.startsWith('image/')) {
        setError('Please select an image file')
        return
      }
      setFile(selectedFile)
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('Please log in to upload')
        return
      }

       // Extract GPS
       const formData = new FormData()
       formData.append('file', file)
       const gpsResponse = await fetch('/api/extract-gps', {
         method: 'POST',
         body: formData
       })

      const gpsData = await gpsResponse.json()

      if (!gpsResponse.ok) {
        throw new Error(gpsData.error || 'Failed to extract GPS data')
      }

      const { latitude, longitude } = gpsData

      // Upload to Supabase Storage
      const fileName = `${user.id}/${Date.now()}-${file.name}`
      const { data, error: uploadError } = await supabase.storage
        .from('route-uploads')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('route-uploads')
        .getPublicUrl(data.path)

      // Determine if GPS data was found
      const hasGps = latitude !== null && longitude !== null

      // Redirect to draw page with session data
      window.location.href = `/draw?imageUrl=${encodeURIComponent(publicUrl)}&lat=${latitude}&lng=${longitude}&hasGps=${hasGps}&sessionId=${Date.now()}`

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif"
        onChange={handleFileChange}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
      />
      {error && <p className="text-red-500 mt-2">{error}</p>}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="mt-4 w-full bg-blue-500 text-white py-2 px-4 rounded disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : 'Upload & Continue'}
      </button>
    </div>
  )
}