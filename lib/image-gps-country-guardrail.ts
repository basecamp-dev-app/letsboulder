import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCountryFromCoordinates } from '@/lib/location/resolve-country'
import { getBoundingBoxesForCountry, validateCoordinatesInBoundingBox } from '@/lib/geo/bounding-boxes'
import { extractGpsFromFile } from '@/lib/image-gps-exif-extractor'

export interface ProcessedImageGpsWithGuardrail {
  latitude: number | null
  longitude: number | null
  detectedCountry: string | null
  selectedCountry: string | null
  isValid: boolean
  validationReason?: string
  matchedRegion?: string
  boundingBoxUsed: string | null
}

export async function processImageGpsWithCountryGuardrail(
  supabase: SupabaseClient,
  file: File,
  userSelectedCountry: string | null
): Promise<ProcessedImageGpsWithGuardrail> {
  const gpsData = await extractGpsFromFile(file)
  
  if (!gpsData) {
    return {
      latitude: null,
      longitude: null,
      detectedCountry: null,
      selectedCountry: userSelectedCountry,
      isValid: false,
      validationReason: 'No GPS data found in image',
      boundingBoxUsed: null
    }
  }
  
  let countryCode: string | null = null
  if (userSelectedCountry) {
    countryCode = userSelectedCountry
  } else {
    try {
      const result = await resolveCountryFromCoordinates(supabase, gpsData.latitude, gpsData.longitude)
      countryCode = result.countryCode
    } catch {
      countryCode = null
    }
  }
  
  if (!countryCode) {
    return {
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
      detectedCountry: null,
      selectedCountry: userSelectedCountry,
      isValid: false,
      validationReason: 'Could not determine country for validation',
      boundingBoxUsed: null
    }
  }
  
  const boundingBoxes = getBoundingBoxesForCountry(countryCode)
  
  if (!boundingBoxes || boundingBoxes.length === 0) {
    return {
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
      detectedCountry: countryCode,
      selectedCountry: userSelectedCountry,
      isValid: false,
      validationReason: `No bounding boxes defined for country ${countryCode}`,
      boundingBoxUsed: null
    }
  }
  
  const validation = validateCoordinatesInBoundingBox(
    gpsData.latitude,
    gpsData.longitude,
    boundingBoxes
  )
  
  return {
    latitude: gpsData.latitude,
    longitude: gpsData.longitude,
    detectedCountry: countryCode,
    selectedCountry: userSelectedCountry,
    isValid: validation.isValid,
    validationReason: validation.reason,
    matchedRegion: validation.matchedRegion,
    boundingBoxUsed: countryCode
  }
}
