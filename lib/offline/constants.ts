export const OFFLINE_DB_NAME = 'letsboulder-offline'
export const OFFLINE_DB_VERSION = 1

export const OFFLINE_ASSETS_CACHE = 'letsboulder-offline-assets-v1'

export function offlineCragMapRequestUrl(cragId: string) {
  return `/__offline/crag/${cragId}/map.png`
}
