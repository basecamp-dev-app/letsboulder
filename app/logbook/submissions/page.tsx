import { permanentRedirect } from 'next/navigation'

interface SubmissionsPageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function SubmissionsPage({ searchParams }: SubmissionsPageProps) {
  const { tab } = await searchParams
  const query = new URLSearchParams({ section: 'submissions' })

  if (tab) {
    query.set('tab', tab)
  }

  permanentRedirect(`/logbook?${query.toString()}`)
}
