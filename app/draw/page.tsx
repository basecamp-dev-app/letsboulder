import RouteEditor from './components/RouteEditor'

interface DrawPageProps {
  searchParams: Promise<{
    imageUrl: string
    lat: string
    lng: string
    sessionId: string
    hasGps?: string
    captureDate?: string
  }>
}

export default async function DrawPage({ searchParams }: DrawPageProps) {
  const params = await searchParams
  const { imageUrl, lat, lng, sessionId, hasGps, captureDate } = params

  if (!imageUrl) {
    return <div>Invalid session. Please start from upload.</div>
  }

  const hasGpsBool = hasGps === 'true'

  return (
    <div className="h-screen">
      <RouteEditor
        imageUrl={imageUrl}
        latitude={parseFloat(lat)}
        longitude={parseFloat(lng)}
        sessionId={sessionId}
        hasGps={hasGpsBool}
        captureDate={captureDate || null}
      />
    </div>
  )
}