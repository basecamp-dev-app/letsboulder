import NameRoutesForm from './components/NameRoutesForm'

interface NameRoutesPageProps {
  searchParams: {
    sessionId: string
  }
}

export default function NameRoutesPage({ searchParams }: NameRoutesPageProps) {
  const { sessionId } = searchParams

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Review Routes</h1>
      <NameRoutesForm sessionId={sessionId} />
    </div>
  )
}