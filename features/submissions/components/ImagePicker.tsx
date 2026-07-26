'use client'

import { useCallback, useId, useState } from 'react'

interface ImagePickerProps {
  onFilesSelected: (files: File[]) => void | Promise<void>
  disabled?: boolean
}

const MAX_FILES = 20

export default function ImagePicker({ onFilesSelected, disabled = false }: ImagePickerProps) {
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputId = useId()

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || disabled) return

    const files = Array.from(fileList)
      .filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))
      .slice(0, MAX_FILES)

    if (files.length === 0) {
      setError('Select at least one image file.')
      return
    }

    setError(null)
    await onFilesSelected(files)
  }, [disabled, onFilesSelected])

  return (
    <div className="space-y-3">
      <input
        id={inputId}
        type="file"
        multiple
        accept="image/*,.heic,.heif,.HEIC,.HEIF"
        className="peer sr-only"
        disabled={disabled}
        onChange={(event) => {
          void handleFiles(event.target.files)
          event.target.value = ''
        }}
      />

      <label
        htmlFor={inputId}
        aria-disabled={disabled}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setIsDragging(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          setIsDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          void handleFiles(event.dataTransfer.files)
        }}
        className={`flex min-h-32 items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'} ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'}`}
      >
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {disabled ? 'Creating draft...' : isDragging ? 'Drop photos here' : 'Choose or drop topo photos'}
        </p>
      </label>

      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  )
}
