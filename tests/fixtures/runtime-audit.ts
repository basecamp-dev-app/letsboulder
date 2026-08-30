import { expect, test as base, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

export type RuntimeAuditState = 'default' | 'webgl-failure' | 'map-resource-failure' | 'offline-network' | 'pin-request-failure' | 'geolocation-success' | 'geolocation-error' | 'geolocation-timeout'
export type AuditViewport = { label: string; width: number; height: number; orientation: 'portrait' | 'landscape' }
export type RuntimeAuditIssue = { category: 'horizontal-overflow' | 'clipped-overlay' | 'hidden-action' | 'keyboard-obstruction' | 'gesture-trap' | 'state-fixture'; details: string }
export type RuntimeAuditEvidence = {
  project: string; route: string; state: RuntimeAuditState; viewport: AuditViewport
  outcome?: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'; retry?: number
  checks: { horizontalOverflow: 'absent' | 'logged'; clippedOverlay: 'absent' | 'logged'; hiddenAction: 'absent' | 'logged'; keyboardObstruction: 'absent' | 'logged'; gestureTrap: 'absent' | 'logged'; landscape: 'recorded' | 'not-applicable' | 'missing' }
  issues: RuntimeAuditIssue[]
}

export const AUDIT_VIEWPORTS: AuditViewport[] = [
  { label: 'mobile-320', width: 320, height: 568, orientation: 'portrait' }, { label: 'mobile-375', width: 375, height: 667, orientation: 'portrait' }, { label: 'mobile-390', width: 390, height: 844, orientation: 'portrait' }, { label: 'mobile-430', width: 430, height: 932, orientation: 'portrait' }, { label: 'tablet-portrait', width: 768, height: 1024, orientation: 'portrait' }, { label: 'desktop-portrait', width: 1024, height: 1366, orientation: 'portrait' }, { label: 'mobile-landscape', width: 844, height: 390, orientation: 'landscape' },
]
export const AUDIT_ROUTES = ['/', '/about', '/impact', '/auth', '/gym-owners/apply', '/privacy', '/terms', '/this-route-does-not-exist', '/gb/harrisons-rocks', '/gb/harrisons-rocks/giants-ear'] as const

type AuditFixtures = { blockedMutationRequests: string[] }
async function attachAuditScreenshot(page: Page, testInfo: TestInfo) {
  if (testInfo.attachments.some(({ name }) => name === 'runtime-audit-screenshot')) return
  try { await testInfo.attach('runtime-audit-screenshot', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' }) } catch { /* browser crashes can make screenshots unavailable; validation reports that explicitly */ }
}

export const test = base.extend<AuditFixtures>({
  blockedMutationRequests: [async ({ context, baseURL, page }, use, testInfo) => {
    const blocked: string[] = []; const auditedOrigin = new URL(baseURL || 'http://localhost:3000').origin
    await context.route('**/*', async route => { const request = route.request(); if (new URL(request.url()).origin === auditedOrigin && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { blocked.push(`${request.method()} ${request.url()}`); await route.abort('blockedbyclient'); return } await route.fallback() })
    await use(blocked)
    if (blocked.length || (testInfo.status && testInfo.status !== testInfo.expectedStatus)) await attachAuditScreenshot(page, testInfo)
    expect(blocked, 'Runtime audits must never mutate production or staging data').toEqual([])
  }, { auto: true }],
})
export { expect }
export async function isVisibleWithin(locator: import('@playwright/test').Locator, timeout: number) { return locator.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false) }

export async function auditRenderedPage(page: Page, testInfo: TestInfo, route: string, state: RuntimeAuditState, viewport: AuditViewport, fixtureIssues: RuntimeAuditIssue[] = []) {
  const issues = [...fixtureIssues]
  const collectLayout = () => page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth, viewportHeight = document.documentElement.clientHeight
    const visible = (el: Element) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0 && r.width > 0 && r.height > 0 }
    const clipped = (el: Element) => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > viewportWidth + 1 || r.top < -1 || r.bottom > viewportHeight + 1 }
    const label = (el: Element) => el.getAttribute('aria-label') || el.getAttribute('name') || (el as HTMLElement).innerText?.trim().slice(0, 80) || el.tagName.toLowerCase()
    const overlaySelector = '[role="dialog"], [role="alert"], [role="status"], [role="menu"], [role="listbox"]'
    const overlays = Array.from(document.querySelectorAll(overlaySelector)).filter(el => visible(el) && ['fixed', 'absolute', 'sticky'].includes(getComputedStyle(el).position) && clipped(el)).map(label)
    const clippedActions = Array.from(document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]')).filter(el => { if (!visible(el) || el.hasAttribute('disabled') || !clipped(el)) return false; const overlay = el.closest(overlaySelector); return ['fixed', 'sticky'].includes(getComputedStyle(el).position) || Boolean(overlay && visible(overlay)) }).map(label)
    const mapCanvas = Array.from(document.querySelectorAll('.maplibregl-canvas')).find(visible), mapControls = Array.from(document.querySelectorAll('.maplibregl-ctrl button')).filter(visible).length
    return { horizontalOverflow: document.documentElement.scrollWidth > viewportWidth + 1, scrollWidth: document.documentElement.scrollWidth, viewportWidth, overlays, clippedActions, gestureSurfaceWithoutControls: Boolean(mapCanvas && getComputedStyle(mapCanvas).touchAction === 'none' && mapControls === 0) }
  })
  let layout: Awaited<ReturnType<typeof collectLayout>>
  try { layout = await collectLayout() } catch (first) { await page.waitForLoadState('domcontentloaded').catch(() => undefined); try { layout = await collectLayout() } catch (second) { const size = page.viewportSize(); layout = { horizontalOverflow: false, scrollWidth: size?.width ?? viewport.width, viewportWidth: size?.width ?? viewport.width, overlays: [], clippedActions: [], gestureSurfaceWithoutControls: false }; issues.push({ category: 'state-fixture', details: `Layout evidence could not be collected after navigation settled: ${second instanceof Error ? second.message : String(second)} (initial: ${first instanceof Error ? first.message : String(first)})` }) } }
  if (layout.horizontalOverflow) issues.push({ category: 'horizontal-overflow', details: `document width ${layout.scrollWidth}px exceeds ${layout.viewportWidth}px viewport` }); for (const value of layout.overlays) issues.push({ category: 'clipped-overlay', details: value }); for (const value of layout.clippedActions) issues.push({ category: 'hidden-action', details: value }); if (layout.gestureSurfaceWithoutControls) issues.push({ category: 'gesture-trap', details: 'Map gesture surface disables native touch gestures without visible map controls' })
  let keyboard: RuntimeAuditEvidence['checks']['keyboardObstruction'] = 'absent'; const focusTarget = page.locator('input:not([type="hidden"]), textarea, select').filter({ visible: true }).first()
  if (await focusTarget.count()) { const size = page.viewportSize(); if (size) { await page.setViewportSize({ width: size.width, height: Math.max(360, Math.floor(size.height * 0.58)) }); await focusTarget.focus(); await focusTarget.scrollIntoViewIfNeeded(); if (await focusTarget.evaluate(el => el.getBoundingClientRect().bottom > window.innerHeight)) { keyboard = 'logged'; issues.push({ category: 'keyboard-obstruction', details: 'The focused form control is below the simulated keyboard viewport' }) } await page.setViewportSize(size) } }
  const evidence: RuntimeAuditEvidence = { project: testInfo.project.name, route, state, viewport, checks: { horizontalOverflow: issues.some(i => i.category === 'horizontal-overflow') ? 'logged' : 'absent', clippedOverlay: issues.some(i => i.category === 'clipped-overlay') ? 'logged' : 'absent', hiddenAction: issues.some(i => i.category === 'hidden-action') ? 'logged' : 'absent', keyboardObstruction: keyboard, gestureTrap: layout.gestureSurfaceWithoutControls ? 'logged' : 'absent', landscape: viewport.orientation === 'landscape' ? 'recorded' : 'not-applicable' }, issues }
  await testInfo.attach('runtime-audit-evidence', { body: JSON.stringify(evidence), contentType: 'application/json' })
  const applicationFinding = issues.some(i => i.category !== 'state-fixture'); if (applicationFinding && ((viewport.width >= 320 && viewport.width <= 430) || viewport.orientation === 'landscape')) await attachAuditScreenshot(page, testInfo)
  expect.soft(issues, 'Runtime audit findings are attached in the evidence row').toEqual([]); return evidence
}

async function installGeolocationFixture(page: Page, state: 'success' | 'error' | 'timeout') {
  await page.addInitScript(fixtureState => { const position = { coords: { accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, latitude: 51.096, longitude: 0.225, speed: null }, timestamp: Date.now() }; const failure = { code: fixtureState === 'timeout' ? 3 : 1, message: fixtureState === 'timeout' ? 'Audit fixture timed out' : 'Audit fixture denied permission', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }; Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { clearWatch: () => undefined, getCurrentPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => setTimeout(() => fixtureState === 'success' ? success(position as GeolocationPosition) : error?.(failure as GeolocationPositionError), fixtureState === 'timeout' ? 100 : 0), watchPosition: () => 1 } }) }, state)
}

export async function exerciseRuntimeState(page: Page, context: BrowserContext, state: Exclude<RuntimeAuditState, 'default'>) {
  const issues: RuntimeAuditIssue[] = []
  if (state === 'webgl-failure') await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId, options) { if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') return null; return original.call(this, contextId, options) } as typeof HTMLCanvasElement.prototype.getContext })
  if (state === 'map-resource-failure') await page.route(/tiles\.openfreemap\.org\/.+\.(?:pbf|png|webp)(?:\?.*)?$/, route => route.abort('connectionfailed')); if (state === 'pin-request-failure') await page.route(/\/api\/crags\/pins(?:\?.*)?$/, route => route.abort('connectionfailed')); if (state.startsWith('geolocation-')) await installGeolocationFixture(page, state.replace('geolocation-', '') as 'success' | 'error' | 'timeout')
  await page.goto('/', { waitUntil: 'domcontentloaded' }); if (!await isVisibleWithin(page.locator('main#main-content'), 15000)) issues.push({ category: 'state-fixture', details: 'The main landmark did not become visible' })
  if (state === 'offline-network') { await isVisibleWithin(page.locator('.maplibregl-map'), 20000); await context.setOffline(true); await page.evaluate(() => dispatchEvent(new Event('offline'))); if (!await isVisibleWithin(page.getByText(/connection lost\. map updates are unavailable/i), 5000)) issues.push({ category: 'state-fixture', details: 'Offline state was exercised but its recovery status was not visible' }) }
  else if (state === 'webgl-failure') { if (!await isVisibleWithin(page.getByRole('heading', { name: /interactive map unavailable/i }), 15000)) issues.push({ category: 'state-fixture', details: 'WebGL failure did not expose the map-unavailable recovery state' }) }
  else if (state === 'map-resource-failure') { if (!await isVisibleWithin(page.getByText(/some map resources did not load|interactive map unavailable/i).first(), 15000)) issues.push({ category: 'state-fixture', details: 'Map-resource failure did not expose a degraded or unavailable state' }) }
  else if (state === 'pin-request-failure') { await isVisibleWithin(page.locator('.maplibregl-map'), 20000); if (!await isVisibleWithin(page.getByText(/couldn.t load map pins/i), 15000)) issues.push({ category: 'state-fixture', details: 'Pin-request failure did not expose its recovery alert' }) }
  else { await page.getByRole('button', { name: /find climbing near me/i }).click(); const expected = state === 'geolocation-success' ? /location found/i : /try location again/i; if (!await isVisibleWithin(page.getByRole('button', { name: expected }), 15000)) issues.push({ category: 'state-fixture', details: `${state} did not reach its expected visible status` }) }
  return issues
}
