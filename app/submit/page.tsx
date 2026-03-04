import { redirect } from 'next/navigation'

interface SubmitPageProps {
  searchParams: Promise<{ draftId?: string; from?: string }>
}

export default async function SubmitPage({ searchParams }: SubmitPageProps) {
  const params = await searchParams
  const nextParams = new URLSearchParams({ mode: 'new' })

  if (params.draftId) {
    nextParams.set('draftId', params.draftId)
  }

  if (params.from) {
    nextParams.set('from', params.from)
  }

  redirect(`/logbook/submissions?${nextParams.toString()}`)
}
