import { redirect } from 'next/navigation'

interface NameRoutesPageProps {
  searchParams: Promise<{
    sessionId: string
  }>
}

export default async function NameRoutesPage({ searchParams }: NameRoutesPageProps) {
  const params = await searchParams
  const { sessionId } = params

  redirect(`/draw?sessionId=${sessionId}`)
}