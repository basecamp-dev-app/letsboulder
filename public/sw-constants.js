self.__WB_DISABLE_DEV_LOGS = true

const SHELL_CACHE = 'offline-shell-v4'
const PACK_CACHE = 'offline-climb-packs-v3'
const MEDIA_CACHE = 'offline-media-v2'
const TILE_CACHE = 'offline-tiles-v2'
const ROUTE_ASSET_CACHE = 'offline-route-assets-v2'
const BUILD_ASSET_CACHE_PREFIX = 'offline-build-assets'
const TRANSIENT_CACHE = 'runtime-transient-v2'
const HOME_URL = '/'
const OFFLINE_URL = '/offline'
const MANIFEST_URL = '/manifest.json'
const BUILD_MANIFEST_URL = '/_next/build-manifest.json'
const SW_BUILD_ASSET_MANIFEST_URL = '/sw-build-assets.json'
const LOGO_URL = '/logo.png'
const LOGO_LIGHT_URL = '/logo-light.png'
const LOGO_DARK_URL = '/logo-dark.png'
const THEME_INIT_URL = '/theme-init.js'
const SHELL_ROUTES = [HOME_URL, OFFLINE_URL, MANIFEST_URL, LOGO_URL, LOGO_LIGHT_URL, LOGO_DARK_URL, THEME_INIT_URL, SW_BUILD_ASSET_MANIFEST_URL]
const ACTIVE_CACHES = [SHELL_CACHE, PACK_CACHE, MEDIA_CACHE, TILE_CACHE, ROUTE_ASSET_CACHE, TRANSIENT_CACHE]

if (typeof globalThis !== 'undefined') {
  globalThis.SHELL_CACHE = SHELL_CACHE
  globalThis.PACK_CACHE = PACK_CACHE
  globalThis.MEDIA_CACHE = MEDIA_CACHE
  globalThis.TILE_CACHE = TILE_CACHE
  globalThis.ROUTE_ASSET_CACHE = ROUTE_ASSET_CACHE
  globalThis.BUILD_ASSET_CACHE_PREFIX = BUILD_ASSET_CACHE_PREFIX
  globalThis.TRANSIENT_CACHE = TRANSIENT_CACHE
  globalThis.HOME_URL = HOME_URL
  globalThis.OFFLINE_URL = OFFLINE_URL
  globalThis.MANIFEST_URL = MANIFEST_URL
  globalThis.BUILD_MANIFEST_URL = BUILD_MANIFEST_URL
  globalThis.SW_BUILD_ASSET_MANIFEST_URL = SW_BUILD_ASSET_MANIFEST_URL
  globalThis.LOGO_URL = LOGO_URL
  globalThis.LOGO_LIGHT_URL = LOGO_LIGHT_URL
  globalThis.LOGO_DARK_URL = LOGO_DARK_URL
  globalThis.THEME_INIT_URL = THEME_INIT_URL
  globalThis.SHELL_ROUTES = SHELL_ROUTES
  globalThis.ACTIVE_CACHES = ACTIVE_CACHES
}
