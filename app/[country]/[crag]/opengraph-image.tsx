import { ImageResponse } from 'next/og'
import { createServerClient } from '@supabase/ssr'
import { BRAND_NAME } from '@/lib/site'

export const revalidate = 300
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

interface CragParams {
  country: string
  crag: string
}

interface CragRow {
  id: string
  name: string
  region_name: string | null
  country: string | null
}

interface CragImageRow {
  url: string | null
}

function fallbackCard(title: string, location: string) {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0f172a 0%, #111827 55%, #1f2937 100%)',
          color: '#ffffff',
          padding: '56px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ fontSize: 26, opacity: 0.86, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Crag Guide</div>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.02, maxWidth: 760 }}>{title}</div>
          {location ? <div style={{ fontSize: 34, opacity: 0.9 }}>{location}</div> : null}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 24px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 30,
          }}
        >
          {BRAND_NAME}
        </div>
      </div>
    ),
    size
  )
}

export default async function OpenGraphImage({ params }: { params: Promise<CragParams> }) {
  const { country, crag: cragSlug } = await params
  if (!country || !cragSlug || country.length !== 2) {
    return fallbackCard('Crag not found', '')
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  const { data: crag } = await supabase
    .from('crags')
    .select('id, name, region_name, country')
    .eq('country_code', country.toUpperCase())
    .eq('slug', cragSlug)
    .single()

  if (!crag) {
    return fallbackCard('Crag not found', '')
  }

  const typedCrag = crag as CragRow
  const location = [typedCrag.region_name, typedCrag.country].filter(Boolean).join(', ')

  const { data: imageRows } = await supabase
    .from('images')
    .select('url')
    .eq('crag_id', typedCrag.id)
    .order('created_at', { ascending: false })
    .limit(3)

  const imageUrls = ((imageRows || []) as CragImageRow[])
    .map((row) => row.url)
    .filter((url): url is string => Boolean(url))

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          background: '#020617',
          color: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: 670,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '52px 52px 40px',
            background: 'linear-gradient(160deg, #0f172a 0%, #0b1220 55%, #111827 100%)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ fontSize: 24, opacity: 0.85, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Crag Guide</div>
            <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.02, maxWidth: 560 }}>{typedCrag.name}</div>
            {location ? <div style={{ fontSize: 32, opacity: 0.92, maxWidth: 560 }}>{location}</div> : null}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: 560,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 20px',
                background: 'rgba(0, 0, 0, 0.28)',
                borderRadius: 999,
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              {BRAND_NAME}
            </div>
            <div style={{ fontSize: 22, opacity: 0.78 }}>Map, topos, routes</div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: 16,
            gap: 12,
            background: '#030712',
          }}
        >
          <div style={{ display: 'flex', gap: 12, flex: 1 }}>
            <div
              style={{
                width: 282,
                borderRadius: 18,
                overflow: 'hidden',
                background: '#111827',
                position: 'relative',
              }}
            >
              {imageUrls[0] ? (
                <img
                  src={imageUrls[0]}
                  alt="Crag collage image"
                  width={282}
                  height={598}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : null}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.36) 100%)',
                }}
              />
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[imageUrls[1], imageUrls[2]].map((url, index) => (
                <div
                  key={url || `placeholder-${index}`}
                  style={{
                    flex: 1,
                    borderRadius: 18,
                    overflow: 'hidden',
                    background: 'linear-gradient(145deg, #1f2937 0%, #111827 100%)',
                    position: 'relative',
                    display: 'flex',
                  }}
                >
                  {url ? (
                    <img
                      src={url}
                      alt="Crag collage image"
                      width={220}
                      height={293}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : null}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.42) 100%)',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(2,6,23,0.24) 0%, rgba(2,6,23,0) 38%)',
            pointerEvents: 'none',
          }}
        />
      </div>
    ),
    size
  )
}
