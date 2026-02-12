import { ImageResponse } from 'next/og'
import { createServerClient } from '@supabase/ssr'
import { BRAND_NAME } from '@/lib/site'

export const revalidate = 300
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

interface ImageParams {
  id: string
}

interface ImageRow {
  url: string | null
  crags: Array<{ name: string | null }> | { name: string | null } | null
}

function fallbackCard(title: string, subtitle: string) {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px',
          background: 'linear-gradient(150deg, #111827 0%, #030712 100%)',
          color: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 24, opacity: 0.82, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Route Topo</div>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.02, maxWidth: 860 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 32, opacity: 0.9 }}>{subtitle}</div> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, fontWeight: 700 }}>{BRAND_NAME}</div>
      </div>
    ),
    size
  )
}

export default async function OpenGraphImage({ params }: { params: Promise<ImageParams> }) {
  const { id } = await params
  if (!id) {
    return fallbackCard('Route image', '')
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  const { data: imageData } = await supabase
    .from('images')
    .select('url, crags(name)')
    .eq('id', id)
    .single()

  if (!imageData) {
    return fallbackCard('Route image', '')
  }

  const typedImage = imageData as ImageRow
  const cragJoin = typedImage.crags
  const cragName = Array.isArray(cragJoin)
    ? (cragJoin[0]?.name || null)
    : (cragJoin?.name || null)
  const title = cragName ? `Route topo at ${cragName}` : 'Route topo'

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          position: 'relative',
          background: '#030712',
          color: '#ffffff',
          overflow: 'hidden',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {typedImage.url ? (
          <img
            src={typedImage.url}
            alt="Route image"
            width={1200}
            height={630}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : null}

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(2,6,23,0.04) 0%, rgba(2,6,23,0.74) 100%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: 40,
            right: 40,
            bottom: 36,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', fontSize: 23, opacity: 0.86, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Route Topo
          </div>
          <div style={{ display: 'flex', fontSize: 56, fontWeight: 800, lineHeight: 1.02, maxWidth: 980 }}>{title}</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 4,
              padding: '10px 18px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.4)',
              width: 'fit-content',
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {BRAND_NAME}
          </div>
        </div>
      </div>
    ),
    size
  )
}
