import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import {
  CacheFirst,
  ExpirationPlugin,
  CacheableResponsePlugin,
  Serwist,
  StaleWhileRevalidate,
} from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
})

serwist.registerCapture(
  /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//,
  new CacheFirst({
    cacheName: 'supabase-storage-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
)

serwist.registerCapture(
  ({ url }) => {
    return url.origin === self.location.origin && url.pathname.includes('/api/crags/') && url.pathname.endsWith('/static-map')
  },
  new StaleWhileRevalidate({
    cacheName: 'crag-static-maps',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 250, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
)

serwist.addEventListeners()
