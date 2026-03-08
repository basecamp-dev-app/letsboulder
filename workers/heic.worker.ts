/// <reference lib="webworker" />

import heic2any from 'heic2any'

self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    const jpegBlob = await heic2any({
      blob: event.data,
      toType: 'image/jpeg',
      quality: 0.9,
    })

    const result = Array.isArray(jpegBlob) ? jpegBlob[0] : jpegBlob
    self.postMessage({ ok: true, blob: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HEIC conversion failed'
    self.postMessage({ ok: false, error: message })
  }
}
