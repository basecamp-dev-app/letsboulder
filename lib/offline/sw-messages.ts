interface ServiceWorkerMessage<TPayload> {
  type: string
  payload: TPayload
}

interface ServiceWorkerResponse {
  ok: boolean
  error?: string
}

async function waitForController() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service worker is not supported')
  }

  const registration = await navigator.serviceWorker.ready
  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller
  }

  if (registration.active) {
    return registration.active
  }

  throw new Error('Service worker is not active')
}

export async function sendServiceWorkerMessage<TPayload>(message: ServiceWorkerMessage<TPayload>) {
  const controller = await waitForController()

  return new Promise<ServiceWorkerResponse>((resolve, reject) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = (event) => {
      resolve((event.data || { ok: false, error: 'Unknown service worker response' }) as ServiceWorkerResponse)
    }

    try {
      controller.postMessage(message, [channel.port2])
    } catch (error) {
      reject(error)
    }
  })
}
