import RouteCanvas from './components/RouteCanvas'

interface DrawPageProps {
  searchParams: Promise<{
    imageUrl: string
    lat: string
    lng: string
    sessionId: string
  }>
}

export default async function DrawPage({ searchParams }: DrawPageProps) {
  const params = await searchParams
  const { imageUrl, lat, lng, sessionId } = params

  if (!imageUrl) {
    return <div>Invalid session. Please start from upload.</div>
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Draw Climbing Routes</h1>
      <RouteCanvas imageUrl={imageUrl} latitude={parseFloat(lat)} longitude={parseFloat(lng)} sessionId={sessionId} />
    </div>
  )
}