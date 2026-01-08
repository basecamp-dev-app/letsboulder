declare module 'exif-heic-js' {
  interface GPSInfo {
    GPSLatitude?: number[]
    GPSLatitudeRef?: 'N' | 'S'
    GPSLongitude?: number[]
    GPSLongitudeRef?: 'E' | 'W'
  }

  interface EXIFData {
    GPSInfo?: GPSInfo
    [key: string]: any
  }

  export function findEXIFinHEIC(buffer: ArrayBuffer): EXIFData | null
}
