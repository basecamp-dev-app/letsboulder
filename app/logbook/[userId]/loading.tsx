import { LogbookSkeleton } from '@/components/logbook/logbook-states'

export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <LogbookSkeleton variant="public" showProfile={true} showCharts={true} showRecentLogs={true} />
    </div>
  )
}
