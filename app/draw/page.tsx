import RouteCanvas from './components/RouteCanvas'

interface DrawPageProps {
  searchParams: Promise<{
    imageUrl: string
    lat: string
    lng: string
    sessionId: string
    hasGps?: string // Added
  }>
}

export default async function DrawPage({ searchParams }: DrawPageProps) {
  const params = await searchParams
  const { imageUrl, lat, lng, sessionId, hasGps } = params // Destructured hasGps

  if (!imageUrl) {
    return <div>Invalid session. Please start from upload.</div>
  }

  const hasGpsBool = hasGps === 'true' // Converted to boolean

  return (
    <div className="h-screen">
      <RouteCanvas
        imageUrl={imageUrl}
        latitude={parseFloat(lat)}
        longitude={parseFloat(lng)}
        sessionId={sessionId}
        hasGps={hasGpsBool} // Passed to component
      />
    </div>
  )
}