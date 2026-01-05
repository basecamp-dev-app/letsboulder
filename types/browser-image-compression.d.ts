declare module 'browser-image-compression' {
  interface CompressionOptions {
    maxSizeMB?: number
    maxWidthOrHeight?: number
    useWebWorker?: boolean
    preserveExif?: boolean
    initialQuality?: number
    onProgress?: (progress: number) => void
  }

  function imageCompression(
    file: File,
    options?: CompressionOptions
  ): Promise<File>

  export default imageCompression
}
