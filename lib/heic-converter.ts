'use client'

async function convertHeicWithFallback(file: Blob): Promise<Blob> {
  const heic2any = (await import('heic2any')).default
  const jpegBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
  return Array.isArray(jpegBlob) ? jpegBlob[0] : jpegBlob
}

export async function convertHeicToJpegBlob(file: Blob): Promise<Blob> {
  if (typeof Worker === 'undefined') {
    return convertHeicWithFallback(file)
  }

  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/heic.worker.ts', import.meta.url))

    worker.onmessage = (event: MessageEvent<{ ok: boolean; blob?: Blob; error?: string }>) => {
      worker.terminate()

      if (event.data.ok && event.data.blob) {
        resolve(event.data.blob)
        return
      }

      reject(new Error(event.data.error || 'HEIC conversion failed'))
    }

    worker.onerror = () => {
      worker.terminate()
      void convertHeicWithFallback(file).then(resolve).catch(reject)
    }

    worker.postMessage(file)
  })
}
