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
    <div className="h-screen">
      <RouteCanvas imageUrl={imageUrl} latitude={parseFloat(lat)} longitude={parseFloat(lng)} sessionId={sessionId} />
    </div>
  )
}