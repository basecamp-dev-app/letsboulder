# Climbing Patterns - LetsBoulder.com

This library contains the "how-to" for unique climbing features.

---

## 1. Canvas Drawing

### Pattern
```typescript
'use client'
import { useRef, useEffect } from 'react'

export default function RouteCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    // Use quadratic curves for smooth route drawing
  }, [])
  
  return <canvas ref={canvasRef} />
}
```

### Known Edge Cases
- **High DPI displays:** Scale canvas by `window.devicePixelRatio` or lines will appear blurry
- **Touch vs Mouse:** Handle both `touchstart`/`touchmove` and `mousedown`/`mousemove` events
- **Resize:** Debounce resize handlers; redraw on orientation change

---

## 2. Leaflet Maps

### Pattern
```typescript
'use client'
import dynamic from 'next/dynamic'

const Map = dynamic(() => import('./ClimbMap'), { ssr: false })

export default function Page() {
  return <Map />
}
```

### Known Edge Cases
- **SSR:** Leaflet requires `ssr: false` - always use `next/dynamic`
- **Geolocation:** Handle permission denial gracefully; provide manual location fallback
- **Tile loading:** Show skeleton/placeholder while tiles load; handle offline mode

---

## 3. GPS Extraction

### Pattern
```typescript
import exifr from 'exifr'

async function extractGPS(file: File) {
  const data = await exifr.parse(file, { gps: true })
  if (data?.latitude && data?.longitude) {
    return { lat: data.latitude, lng: data.longitude }
  }
  return null
}
```

### Known Edge Cases
- **Stripped metadata:** Exifr may fail on images with stripped EXIF data; **fallback to manual location selection**
- **HEIC files:** Requires separate parsing; use `heic2any` conversion first
- **Rotation:** Check `Orientation` tag; some images return rotated coordinates

---

## 4. HEIC Conversion

### Pattern
```typescript
import heic2any from 'heic2any'

async function convertHEIC(file: File): Promise<Blob> {
  const result = await heic2any({ blob: file, toType: 'image/jpeg' })
  return result[0] as Blob
}
```

### Known Edge Cases
- **Resource-intensive:** Conversion is CPU-heavy; **wrap in a Web Worker or show a clear 'Processing' state**
- **Large files:** Downscale to max 2048px before conversion to prevent memory issues
- **Progressive format:** Some iOS HEIC files use HEVC; fallback to server-side conversion if client fails

---

## 5. Grade Conversion

### Pattern
```typescript
import { getGradeIndex, getGradeDisplay, gradeMappings } from '@/lib/grades'

// User inputs "V5" → convert to internal grade_index
const index = getGradeIndex('V5') // → 5

// Display as French grade
const french = getGradeDisplay(5, 'french_equivalent') // → '7a'
```

### Known Edge Cases
- **Range grades:** Some Font grades span multiple V grades (e.g., `6C+` → `V5-6`); this is display-only
- **Out of range:** Grades outside VB-V16 return null; handle gracefully
- **Case sensitivity:** `getGradeIndex` normalizes automatically; do not pre-process

---

## 6. Offline / PWA

### Pattern
```typescript
// Service worker: public/sw.js
// Use custom offline page: app/offline/page.tsx
```

### Known Edge Cases
- **Storage quota:** Warn user before download; estimate tile count (~100 tiles per crag)
- **Update detection:** Check last_modified to prompt for re-download
- **Cache invalidation:** Use version hashes in manifest; invalidate old caches on update
- **Network-first vs Cache-first:** Routes = network-first, media = cache-first, downloaded tiles = cache-only
- **Offline scope:** Keep offline support limited to saved `crag -> climb` flows. Use document navigations for offline entry/open actions instead of relying on App Router client transitions.
- **Storage quota failures:** Handle `QuotaExceededError`; prompt user to clear offline data when a saved-pack download cannot complete.
- **OSM Compliance:** Browser fetch cannot reliably override `User-Agent`; handle provider compliance server-side and consider a self-hosted tile server for production scale

---

## 7. Community Posts

### Pattern
- **Structure:** Place-centric by default (`/community/places/[slug]`)
- **Post types:** `session`, `conditions`, `question`, `update`

### Known Edge Cases
- **Empty states:** Show helpful prompts for each post type (e.g., "Share today's conditions")
- **Media:** Compress images to max 1200px width; use WebP with JPEG fallback
- **Moderation:** Flag posts with keywords; require approval for new crag tags

---

<next_steps>
  - Add new patterns as climbing features evolve
  - Document edge cases when bugs are discovered in production
</next_steps>
