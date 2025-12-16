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
    <div className="h-screen flex flex-col">
      <div className="p-4 bg-white border-b">
        <h1 className="text-2xl font-bold">Draw Climbing Routes</h1>
      </div>
      <div className="flex-1">
        <RouteCanvas imageUrl={imageUrl} latitude={parseFloat(lat)} longitude={parseFloat(lng)} sessionId={sessionId} />
      </div>
    </div>
  )
}