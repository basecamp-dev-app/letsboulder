import { getGeoJsonBoundingBoxesForCountry } from '@/lib/geo/country-bounds'

export interface BoundingBox {
  name: string;           // e.g., 'Contiguous', 'Hawaii', 'Mainland'
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

// Map standard ISO country codes to arrays of regional bounding boxes
export const COUNTRY_BOUNDING_BOXES: Record<string, BoundingBox[]> = {
  // United States
  US: [
    { name: 'Contiguous', minLat: 24.4, maxLat: 49.4, minLng: -124.8, maxLng: -66.9 },
    { name: 'Hawaii', minLat: 18.9, maxLat: 22.3, minLng: -160.2, maxLng: -154.8 },
    { name: 'Alaska', minLat: 51.2, maxLat: 71.4, minLng: -179.1, maxLng: -129.9 }
  ],
  
  // France
  FR: [
    { name: 'Mainland', minLat: 41.3, maxLat: 51.1, minLng: -5.1, maxLng: 9.6 },
    { name: 'Reunion', minLat: -21.4, maxLat: -20.8, minLng: 55.2, maxLng: 55.9 },
    { name: 'Guadeloupe', minLat: 15.8, maxLat: 16.5, minLng: -61.8, maxLng: -61.0 },
    { name: 'Martinique', minLat: 14.4, maxLat: 14.9, minLng: -61.2, maxLng: -60.8 }
  ],
  
  // Spain
  ES: [
    { name: 'Mainland', minLat: 36.0, maxLat: 43.8, minLng: -9.3, maxLng: 3.3 },
    { name: 'Canary Islands', minLat: 27.6, maxLat: 29.4, minLng: -18.2, maxLng: -13.3 }
  ],
  
  // United Kingdom
  GB: [
    { name: 'Great Britain', minLat: 49.8, maxLat: 58.7, minLng: -8.6, maxLng: 1.8 },
    { name: 'Northern Ireland', minLat: 54.0, maxLat: 55.2, minLng: -8.2, maxLng: -5.4 },
    { name: 'Isle of Man', minLat: 54.0, maxLat: 54.5, minLng: -4.8, maxLng: -4.2 }
  ],
  
  // Italy
  IT: [
    { name: 'Mainland', minLat: 36.6, maxLat: 47.1, minLng: 6.6, maxLng: 18.9 },
    { name: 'Sicily', minLat: 36.6, maxLat: 38.8, minLng: 12.0, maxLng: 15.6 },
    { name: 'Sardinia', minLat: 38.9, maxLat: 41.3, minLng: 8.1, maxLng: 9.9 }
  ],
  
  // Switzerland
  CH: [
    { name: 'Switzerland', minLat: 45.8, maxLat: 47.8, minLng: 5.9, maxLng: 10.5 }
  ],
  
  // Austria
  AT: [
    { name: 'Austria', minLat: 46.4, maxLat: 49.0, minLng: 9.5, maxLng: 17.2 }
  ],
  
  // Norway
  NO: [
    { name: 'Mainland', minLat: 57.9, maxLat: 69.1, minLng: 4.5, maxLng: 31.2 },
    { name: 'Svalbard', minLat: 74.0, maxLat: 81.0, minLng: 10.0, maxLng: 35.0 }
  ],
  
  // Sweden
  SE: [
    { name: 'Sweden', minLat: 55.3, maxLat: 69.1, minLng: 10.9, maxLng: 24.2 }
  ],
  
  // Canada
  CA: [
    { name: 'Contiguous', minLat: 41.7, maxLat: 70.0, minLng: -141.0, maxLng: -52.6 },
    { name: 'British Columbia', minLat: 48.3, maxLat: 60.0, minLng: -139.1, maxLng: -114.0 },
    { name: 'Quebec', minLat: 45.0, maxLat: 62.6, minLng: -79.2, maxLng: -57.0 }
  ],
  
  // Australia
  AU: [
    { name: 'Mainland', minLat: -43.6, maxLat: -10.7, minLng: 112.9, maxLng: 153.6 },
    { name: 'Tasmania', minLat: -43.6, maxLat: -39.1, minLng: 143.8, maxLng: 148.4 }
  ],
  
  // New Zealand
  NZ: [
    { name: 'North Island', minLat: -41.7, maxLat: -34.3, minLng: 172.6, maxLng: 178.6 },
    { name: 'South Island', minLat: -47.3, maxLat: -40.5, minLng: 166.0, maxLng: 174.2 }
  ],
  
  // Japan
  JP: [
    { name: 'Honshu', minLat: 33.0, maxLat: 38.7, minLng: 130.0, maxLng: 142.0 },
    { name: 'Hokkaido', minLat: 41.4, maxLat: 45.5, minLng: 139.5, maxLng: 145.8 },
    { name: 'Kyushu', minLat: 30.0, maxLat: 33.7, minLng: 129.5, maxLng: 131.8 }
  ],
  
  // South Korea
  KR: [
    { name: 'South Korea', minLat: 33.0, maxLat: 38.7, minLng: 124.5, maxLng: 131.0 }
  ]
}

export function getBoundingBoxesForCountry(countryCode: string): BoundingBox[] {
  const normalizedCode = countryCode.toUpperCase()
  return COUNTRY_BOUNDING_BOXES[normalizedCode] || getGeoJsonBoundingBoxesForCountry(normalizedCode)
}

export function validateCoordinatesInBoundingBox(
  latitude: number,
  longitude: number,
  boundingBoxes: BoundingBox[]
): { isValid: boolean; matchedRegion?: string; reason?: string } {
  
  if (!boundingBoxes || boundingBoxes.length === 0) {
    return { 
      isValid: false, 
      reason: 'No bounding boxes defined for this country' 
    }
  }
  
  // Check if the coordinate falls into ANY of the defined boxes for this country
  const matchedBox = boundingBoxes.find(box => 
    latitude >= box.minLat && latitude <= box.maxLat &&
    longitude >= box.minLng && longitude <= box.maxLng
  )

  if (matchedBox) {
    return { 
      isValid: true, 
      matchedRegion: matchedBox.name 
    }
  }

  // Calculate which region is closest (for better error messages)
  const distances = boundingBoxes.map(box => ({
    region: box.name,
    distance: Math.min(
      Math.abs(latitude - box.minLat),
      Math.abs(latitude - box.maxLat),
      Math.abs(longitude - box.minLng),
      Math.abs(longitude - box.maxLng)
    )
  }))
  
  const closest = distances.sort((a, b) => a.distance - b.distance)[0]
  
  return { 
    isValid: false, 
    reason: `Coordinates (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) outside ${closest.region} bounds. Closest region: ${closest.region}`
  }
}
