'use client'

import dynamic from 'next/dynamic'
import { useGradeSystem } from '@/features/grades/hooks/useGradeSystem'

const CragRouteChartsContent = dynamic(
  () => import('@/features/crags/components/CragRouteChartsContent'),
  { ssr: false, loading: () => <div className="h-56 flex items-center justify-center text-gray-400">Loading charts...</div> }
)

interface GradeDistributionDatum {
  grade: string
  count: number
}

interface GradeSendDatum {
  grade: string
  sends: number
}

interface CragRouteChartsProps {
  gradeDistribution: GradeDistributionDatum[]
  sendsByGrade: GradeSendDatum[]
}

export default function CragRouteCharts({ gradeDistribution, sendsByGrade }: CragRouteChartsProps) {
  const gradeSystem = useGradeSystem()

  return <CragRouteChartsContent gradeDistribution={gradeDistribution} sendsByGrade={sendsByGrade} gradeSystem={gradeSystem} />
}
