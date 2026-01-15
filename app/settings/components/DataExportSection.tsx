'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

interface DataExportSectionProps {
  userId: string
}

export function DataExportSection({ userId }: DataExportSectionProps) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await fetch('/api/settings/export-data')
      if (!response.ok) throw new Error('Export failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gsyrocks-data-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch {
      console.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="py-4 border-b border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Export Your Data</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Download a copy of all your data including climbs, images, and profile information.
      </p>
      <Button
        variant="outline"
        onClick={handleExport}
        disabled={exporting}
      >
        {exporting ? 'Exporting...' : 'Download My Data'}
      </Button>
    </div>
  )
}
