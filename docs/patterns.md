# Climbing Patterns - letsboulder.com

This library contains the "how-to" for unique climbing features.

## 0. UI Visual Language

### Pattern
- Preserve the current rounded letsboulder visual language across app-owned UI.
- Follow nearby screen and shared component radius patterns instead of introducing a new hard-edge system.
- Keep intentionally circular affordances such as avatars, map pins, status dots, and cluster markers circular.

### Known Edge Cases
- **Global radius assumptions:** `app/globals.css` currently uses a rounded radius token; do not assume `--radius: 0`.
- **Mixed surfaces:** Cards, dialogs, inputs, chips, and overlays may use different rounded scales; match local context before normalizing.

---

## 1. Canvas Drawing

### Pattern
```typescript
'use client'
import { useRef, useEffect, useCallback } from 'react'

export default function RouteCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pathRef = useRef<Path2D | null>(null)
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (pathRef.current) {
      ctx.stroke(pathRef.current)
    }
  }, [dpr])

  useEffect(() => {
    const path = new Path2D()
    path.moveTo(100, 100)
    path.quadraticCurveTo(200, 50, 300, 100)
    pathRef.current = path
    draw()
  }, [draw])

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) draw()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [draw])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '400px' }} />
}
```

### Known Edge Cases
- **High DPI displays:** Scale canvas by `window.devicePixelRatio` or lines will appear blurry
- **Touch vs Mouse:** Handle both `touchstart`/`touchmove` and `mousedown`/`mousemove` events
- **Resize:** Debounce resize handlers; redraw on orientation change
- **Context loss:** On mobile, switching apps can lose canvas context. Use Path2D to store route geometry and redraw on `visibilitychange` event
- **120Hz displays:** Use `requestAnimationFrame` for any animations to prevent stutter on high refresh rate mobile screens

---

## 2. Leaflet Maps

### Pattern
```typescript
'use client'
import dynamic from 'next/dynamic'

const Map = dynamic(() => import('./ClimbMap'), { ssr: false })

// In ClimbMap component:
// <MapContainer preferCanvas={true} ... />

export default function Page() {
  return <Map />
}
```

### Known Edge Cases
- **SSR:** Leaflet requires `ssr: false` - always use `next/dynamic`
- **Geolocation:** Handle permission denial gracefully; provide manual location fallback
- **Tile loading:** Show skeleton/placeholder while tiles load; handle offline mode
- **Marker density:** Use `preferCanvas: true` in MapContainer options. Handles up to ~500 markers efficiently. For 500+, add Supercluster or Canvas-based rendering

---

## 3. GPS Extraction

### Pattern
```typescript
'use client'
import exifr from 'exifr'
import piexif from 'piexifjs'

interface GPSData {
  lat: number
  lng: number
}

interface ExtractResult {
  blob: Blob
  gps: GPSData | null
}

async function extractAndStripGPS(file: File, uploadJpeg: File): Promise<ExtractResult> {
  const data = await exifr.parse(file, { gps: true })
  const gps = data?.latitude && data?.longitude
    ? { lat: data.latitude, lng: data.longitude }
    : null

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Failed to read upload image'))
    reader.onerror = () => reject(new Error('Failed to read upload image'))
    reader.readAsDataURL(uploadJpeg)
  })

  const stripped = piexif.remove(dataUrl)
  const blob = await fetch(stripped).then((response) => response.blob())

  return { blob, gps }
}
```

### Known Edge Cases
- **Stripped metadata:** Exifr may fail on images with stripped EXIF data; **fallback to manual location selection**
- **HEIC files:** Requires separate parsing; use `heic2any` conversion first
- **Rotation:** Check `Orientation` tag; some images return rotated coordinates
- **Privacy:** Always strip EXIF data with `piexif` before uploading to S3/Supabase to prevent exposing user's home location

---

## 4. HEIC Conversion

### Pattern
```typescript
// workers/heic.worker.ts
/// <reference lib="webworker" />
import heic2any from 'heic2any'

self.onmessage = async (e: MessageEvent<File>) => {
  const result = await heic2any({ blob: e.data, toType: 'image/jpeg' })
  self.postMessage(result[0])
}

// lib/heic-converter.ts
'use client'
export async function convertHeicToJpegBlob(file: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/heic.worker.ts', import.meta.url))

    worker.onmessage = (event: MessageEvent<{ ok: boolean; blob?: Blob; error?: string }>) => {
      worker.terminate()
      if (event.data.ok && event.data.blob) resolve(event.data.blob)
      else reject(new Error(event.data.error || 'HEIC conversion failed'))
    }

    worker.onerror = () => {
      worker.terminate()
      reject(new Error('HEIC worker failed'))
    }

    worker.postMessage(file)
  })
}
```

### Known Edge Cases
- **Resource-intensive:** Conversion is CPU-heavy; **Web Worker is mandatory** - do not run on main thread
- **Large files:** Downscale to max 2048px before conversion to prevent memory issues
- **Progressive format:** Some iOS HEIC files use HEVC; fallback to server-side conversion if client fails

---

## 5. Grade Conversion

### Pattern
```typescript
import { getGradeIndex, getGradeDisplay, gradeMappings } from '@/lib/grades'

function normalizeGradeInput(input: string): string {
  const normalized = input.trim().toUpperCase()

  const slashMatch = normalized.match(/^V(\d+)\/(\d+)$/)
  if (slashMatch) return `V${slashMatch[1]}`

  const plusMatch = normalized.match(/^V(\d+)\+$/)
  if (plusMatch) return `V${plusMatch[1]}`

  const minusMatch = normalized.match(/^V(\d+)\-$/)
  if (minusMatch) return `V${String(+minusMatch[1] - 1)}`

  const projectMatch = normalized.match(/^V(\d+)\?$/)
  if (projectMatch) return `V${projectMatch[1]}`

  return normalized
}

function parseVGrade(input: string): number | null {
  const normalized = normalizeGradeInput(input)
  return getGradeIndex(normalized)
}

const index = parseVGrade('V5+') // → 5
const index2 = parseVGrade('V4/5') // → 4
const index3 = parseVGrade('V5?') // → 5

const french = getGradeDisplay(5, 'french_equivalent') // → '7a'
```

### Known Edge Cases
- **Range grades:** Use `gradeMappings` from `@/lib/grades` as single source of truth for V ↔ Font ↔ YDS ↔ French ↔ British
- **Nuance handling:** Normalize inputs: V4/5 → V4, V5+ → V5, V5- → V4, V5? → V5 (project)
- **Public boundaries:** Use `@/lib/grade-constants` for user-facing valid/selectable grades (`4A-9C+`); `@/lib/grades` may still contain broader internal mappings

---

## 6. Offline / PWA

### Pattern
```typescript
// lib/tile-downloader.ts
async function downloadCragTiles(urls: string[], cragId: string, concurrency = 5) {
  const cache = await caches.open(`crag-${cragId}`)
  const queue = [...urls]

  async function worker() {
    while (queue.length) {
      const url = queue.shift()!
      try {
        const res = await fetch(url)
        if (res.ok) await cache.put(url, res)
      } catch {}
    }
  }

  await Promise.all(Array(concurrency).fill(null).map(worker))
}

// app/components/download-offline-button.tsx
'use client'
import { useState } from 'react'
import { getCragTileUrls } from '@/app/actions/download-crag'
import { downloadCragTiles } from '@/lib/tile-downloader'

export function DownloadOfflineButton({ cragId, bounds }: { cragId: string, bounds: any }) {
  const [downloading, setDownloading] = useState(false)

  async function downloadForOffline() {
    setDownloading(true)
    try {
      const urls = await getCragTileUrls(cragId, bounds)
      await downloadCragTiles(urls, cragId)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button onClick={downloadForOffline} disabled={downloading}>
      {downloading ? 'Downloading...' : 'Download for Offline'}
    </button>
  )
}
```

### Known Edge Cases
- **Storage quota:** Warn user before download; estimate tile count (~100 tiles per crag)
- **Update detection:** Check last_modified to prompt for re-download
- **Cache invalidation:** Use versioned cache names; clean old versions on update
- **Network-first vs Cache-first:** Routes = network-first, media = cache-first, downloaded tiles = cache-only
- **Offline scope:** Keep offline support limited to saved `crag -> climb` flows. Use document navigations for offline entry/open actions instead of relying on App Router client transitions.
- **Offline launcher:** Keep `/offline` as a simple chooser page and move saved-pack hydration into `/offline/library` so storage reads cannot trap users behind a preload spinner.
- **OSM Compliance:** Browser fetch cannot reliably override `User-Agent`; handle provider compliance server-side and consider a self-hosted tile server for production scale

---

## 7. Community Posts

### Pattern
```typescript
// app/actions/create-post.ts
'use server'
import { csrfFetch } from '@/lib/csrf'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const content = formData.get('content') as string
  const placeId = formData.get('place_id') as string
  const type = formData.get('type') as 'session' | 'conditions' | 'question' | 'update'

  const { error } = await supabase.from('posts').insert({
    user_id: user.id,
    place_id: placeId,
    content,
    type
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/community/places/${placeId}`)
}
```

```typescript
// app/community/places/[slug]/components/post-list.tsx
'use client'
import { useOptimistic } from 'react'
import { createPost } from '@/app/actions/create-post'

interface Post {
  id: string
  content: string
  type: string
  created_at: string
}

export function PostList({ initialPosts }: { initialPosts: Post[] }) {
  const [posts, addOptimisticPost] = useOptimistic(
    initialPosts,
    (state, newPost: Post) => [...state, { ...newPost, pending: true }]
  )

  async function handleSubmit(formData: FormData) {
    const tempPost: Post = {
      id: `temp-${Date.now()}`,
      content: formData.get('content') as string,
      type: formData.get('type') as string,
      created_at: new Date().toISOString()
    }
    addOptimisticPost(tempPost)
    try {
      await createPost(formData)
    } catch {
      // Optimistic post automatically removed on failure
    }
  }

  return (
    <>
      {posts.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
      <form action={handleSubmit}>
        <textarea name="content" />
        <select name="type">
          <option value="session">Session</option>
          <option value="conditions">Conditions</option>
          <option value="question">Question</option>
          <option value="update">Update</option>
        </select>
        <button type="submit">Post</button>
      </form>
    </>
  )
}
```

### Known Edge Cases
- **Empty states:** Show helpful prompts for each post type (e.g., "Share today's conditions")
- **Media:** Compress images to max 1200px width; use WebP with JPEG fallback
- **Moderation:** Flag posts with keywords; require approval for new crag tags
- **Optimistic UI:** Use `useOptimistic` for instant feedback on slow 3G/LTE connections

---

<next_steps>
  - Add new patterns as climbing features evolve
  - Document edge cases when bugs are discovered in production
</next_steps>
