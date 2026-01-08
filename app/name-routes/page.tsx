import NameRoutesForm from './components/NameRoutesForm'

interface NameRoutesPageProps {
  searchParams: Promise<{
    sessionId: string
  }>
}

export default async function NameRoutesPage({ searchParams }: NameRoutesPageProps) {
  const params = await searchParams
  const { sessionId } = params

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">Review Routes</h1>
      <NameRoutesForm sessionId={sessionId} />
    </div>
  )
}