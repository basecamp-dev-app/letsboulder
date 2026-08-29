import { expect, test as base, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

export type RuntimeAuditState =
  | 'default'
  | 'webgl-failure'
  | 'map-resource-failure'
  | 'offline-network'
  | 'pin-request-failure'
  | 'geolocation-success'
  | 'geolocation-error'
  | 'geolocation-timeout'

export interface AuditViewport {
  label: string
  width: number
  height: number
  orientation: 'portrait' | 'landscape'
}

export interface RuntimeAuditIssue {
  category: 'horizontal-overflow' | 'clipped-overlay' | 'hidden-action' | 'keyboard-obstruction' | 'gesture-trap' | 'state-fixture'
  details: string
}

export interface RuntimeAuditEvidence {
  project: string
  route: string
  state: RuntimeAuditState
  viewport: AuditViewport
  outcome?: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'
  retry?: number
  checks: {
    horizontalOverflow: 'absent' | 'logged'
    clippedOverlay: 'absent' | 'logged'
    hiddenAction: 'absent' | 'logged'
    keyboardObstruction: 'absent' | 'logged'
    gestureTrap: 'absent' | 'logged'
    landscape: 'recorded' | 'not-applicable'
  }
  issues: RuntimeAuditIssue[]
}

export const AUDIT_VIEWPORTS: AuditViewport[] = [
  { label: 'mobile-320', width: 320, height: 568, orientation: 'portrait' },
  { label: 'mobile-375', width: 375, height: 667, orientation: 'portrait' },
  { label: 'mobile-390', width: 390, height: 844, orientation: 'portrait' },
  { label: 'mobile-430', width: 430, height: 932, orientation: 'portrait' },
  { label: 'tablet-portrait', width: 768, height: 1024, orientation: 'portrait' },
  { label: 'desktop-portrait', width: 1024, height: 1366, orientation: 'portrait' },
  { label: 'mobile-landscape', width: 844, height: 390, orientation: 'landscape' },
]

export const AUDIT_ROUTES = [
  '/',
  '/about',
  '/impact',
  '/auth',
  '/gym-owners/apply',
  '/privacy',
  '/terms',
  '/this-route-does-not-exist',
  '/gb/harrisons-rocks',
  '/gb/harrisons-rocks/giants-ear',
] as const

type AuditFixtures = {
  blockedMutationRequests: string[]
}

export const test = base.extend<AuditFixtures>({
  blockedMutationRequests: [async ({ context, baseURL }, use) => {
    const blocked: string[] = []
    const auditedOrigin = new URL(baseURL || 'http://localhost:3000').origin

    await context.route('**/*', async (route) => {
      const request = route.request()
      const method = request.method()
      const sameOrigin = new URL(request.url()).origin === auditedOrigin
      if (sameOrigin && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        blocked.push(`${method} ${request.url()}`)
        await route.abort('blockedbyclient')
        return
      }
      await route.continue()
    })

    await use(blocked)
    expect(blocked, 'Runtime audits must never mutate production data').toEqual([])
  }, { auto: true }],
})

export { expect }

export async function isVisibleWithin(locator: import('@playwright/test').Locator, timeout: number) {
  return locator.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
}

export async function auditRenderedPage(
  page: Page,
  testInfo: TestInfo,
  route: string,
  state: RuntimeAuditState,
  viewport: AuditViewport,
  fixtureIssues: RuntimeAuditIssue[] = [],
) {
  const issues = [...fixtureIssues]
  const collectLayout = () => page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = document.documentElement.clientHeight
    const isRendered = (element: Element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0
    }
    const label = (element: Element) => element.getAttribute('aria-label')
      || element.getAttribute('name')
      || (element as HTMLElement).innerText?.trim().slice(0, 80)
      || element.tagName.toLowerCase()
    const clipped = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return rect.left < -1 || rect.right > viewportWidth + 1 || rect.top < -1 || rect.bottom > viewportHeight + 1
    }

    const overlays = Array.from(document.querySelectorAll('[role="dialog"], [role="alert"], [role="status"], [role="menu"], [role="listbox"]'))
      .filter((element) => isRendered(element) && ['fixed', 'absolute', 'sticky'].includes(getComputedStyle(element).position) && clipped(element))
      .map(label)
    const clippedActions = Array.from(document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]'))
      .filter((element) => {
        if (!isRendered(element) || element.hasAttribute('disabled') || !clipped(element)) return false
        const position = getComputedStyle(element).position
        const overlay = element.closest('[role="dialog"], [role="alert"], [role="status"], [role="menu"], [role="listbox"]')
        return ['fixed', 'sticky'].includes(position) || Boolean(overlay && isRendered(overlay))
      })
      .map(label)
    const mapCanvas = Array.from(document.querySelectorAll('.maplibregl-canvas')).find(isRendered)
    const mapControls = Array.from(document.querySelectorAll('.maplibregl-ctrl button')).filter(isRendered).length

    return {
      horizontalOverflow: document.documentElement.scrollWidth > viewportWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth,
      overlays,
      clippedActions,
      gestureSurfaceWithoutControls: Boolean(mapCanvas && getComputedStyle(mapCanvas).touchAction === 'none' && mapControls === 0),
    }
  })
  let layout: Awaited<ReturnType<typeof collectLayout>>
  try {
    layout = await collectLayout()
  } catch (error) {
    await page.waitForLoadState('domcontentloaded').catch(() => undefined)
    try {
      layout = await collectLayout()
    } catch (retryError) {
      const viewportSize = page.viewportSize()
      layout = {
        horizontalOverflow: false,
        scrollWidth: viewportSize?.width ?? viewport.width,
        viewportWidth: viewportSize?.width ?? viewport.width,
        overlays: [],
        clippedActions: [],
        gestureSurfaceWithoutControls: false,
      }
      issues.push({
        category: 'state-fixture',
        details: `Layout evidence could not be collected after navigation settled: ${retryError instanceof Error ? retryError.message : String(retryError)} (initial: ${error instanceof Error ? error.message : String(error)})`,
      })
    }
  }

  if (layout.horizontalOverflow) {
    issues.push({ category: 'horizontal-overflow', details: `document width ${layout.scrollWidth}px exceeds ${layout.viewportWidth}px viewport` })
  }
  for (const overlay of layout.overlays) issues.push({ category: 'clipped-overlay', details: overlay })
  for (const action of layout.clippedActions) issues.push({ category: 'hidden-action', details: action })
  if (layout.gestureSurfaceWithoutControls) {
    issues.push({ category: 'gesture-trap', details: 'Map gesture surface disables native touch gestures without visible map controls' })
  }

  let keyboardCheck: RuntimeAuditEvidence['checks']['keyboardObstruction'] = 'absent'
  const focusTarget = page.locator('input:not([type="hidden"]), textarea, select').filter({ visible: true }).first()
  if (await focusTarget.count()) {
    const originalSize = page.viewportSize()
    if (originalSize) {
      const keyboardHeight = Math.max(360, Math.floor(originalSize.height * 0.58))
      await page.setViewportSize({ width: originalSize.width, height: keyboardHeight })
      await focusTarget.focus()
      await focusTarget.scrollIntoViewIfNeeded()
      const obstructed = await focusTarget.evaluate((element) => element.getBoundingClientRect().bottom > window.innerHeight)
      keyboardCheck = obstructed ? 'logged' : 'absent'
      if (obstructed) issues.push({ category: 'keyboard-obstruction', details: 'The focused form control is below the simulated keyboard viewport' })
      await page.setViewportSize(originalSize)
    }
  }

  const evidence: RuntimeAuditEvidence = {
    project: testInfo.project.name,
    route,
    state,
    viewport,
    checks: {
      horizontalOverflow: issues.some((issue) => issue.category === 'horizontal-overflow') ? 'logged' : 'absent',
      clippedOverlay: issues.some((issue) => issue.category === 'clipped-overlay') ? 'logged' : 'absent',
      hiddenAction: issues.some((issue) => issue.category === 'hidden-action') ? 'logged' : 'absent',
      keyboardObstruction: keyboardCheck,
      gestureTrap: layout.gestureSurfaceWithoutControls ? 'logged' : 'absent',
      landscape: viewport.orientation === 'landscape' ? 'recorded' : 'not-applicable',
    },
    issues,
  }

  await testInfo.attach('runtime-audit-evidence', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  })

  if (issues.length > 0 && viewport.width >= 320 && viewport.width <= 430) {
    await page.screenshot({ path: testInfo.outputPath('runtime-audit-issues.png'), fullPage: true })
    await testInfo.attach('runtime-audit-issues', {
      path: testInfo.outputPath('runtime-audit-issues.png'),
      contentType: 'image/png',
    })
  }

  expect.soft(issues, 'Runtime audit findings are attached in the evidence row').toEqual([])

  return evidence
}

export async function installGeolocationFixture(page: Page, state: 'success' | 'error' | 'timeout') {
  await page.addInitScript((fixtureState) => {
    const position = {
      coords: {
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        latitude: 51.096,
        longitude: 0.225,
        speed: null,
      },
      timestamp: Date.now(),
    }
    const failure = {
      code: fixtureState === 'timeout' ? 3 : 1,
      message: fixtureState === 'timeout' ? 'Audit fixture timed out' : 'Audit fixture denied permission',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    }

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        clearWatch: () => undefined,
        getCurrentPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => {
          window.setTimeout(() => {
            if (fixtureState === 'success') success(position as GeolocationPosition)
            else error?.(failure as GeolocationPositionError)
          }, fixtureState === 'timeout' ? 100 : 0)
        },
        watchPosition: () => 1,
      },
    })
  }, state)
}

export async function installWebglFailureFixture(page: Page) {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId, options) {
      if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') return null
      return originalGetContext.call(this, contextId, options)
    } as typeof HTMLCanvasElement.prototype.getContext
  })
}

export async function exerciseRuntimeState(page: Page, context: BrowserContext, state: Exclude<RuntimeAuditState, 'default'>) {
  const issues: RuntimeAuditIssue[] = []

  if (state === 'webgl-failure') {
    await installWebglFailureFixture(page)
  }

  if (state === 'map-resource-failure') {
    await page.route(/tiles\.openfreemap\.org\/.+\.(?:pbf|png|webp)(?:\?.*)?$/, (route) => route.abort('connectionfailed'))
  }

  if (state === 'pin-request-failure') {
    await page.route(/\/api\/crags\/pins(?:\?.*)?$/, (route) => route.abort('connectionfailed'))
  }

  if (state.startsWith('geolocation-')) {
    await installGeolocationFixture(page, state.replace('geolocation-', '') as 'success' | 'error' | 'timeout')
  }

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const mainVisible = await isVisibleWithin(page.locator('main#main-content'), 15000)
  if (!mainVisible) issues.push({ category: 'state-fixture', details: 'The main landmark did not become visible' })

  if (state === 'offline-network') {
    await isVisibleWithin(page.locator('.maplibregl-map'), 20000)
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    const visible = await isVisibleWithin(page.getByText(/connection lost\. map updates are unavailable/i), 5000)
    if (!visible) issues.push({ category: 'state-fixture', details: 'Offline state was exercised but its recovery status was not visible' })
  } else if (state === 'webgl-failure') {
    const visible = await isVisibleWithin(page.getByRole('heading', { name: /interactive map unavailable/i }), 15000)
    if (!visible) issues.push({ category: 'state-fixture', details: 'WebGL failure did not expose the map-unavailable recovery state' })
  } else if (state === 'map-resource-failure') {
    const visible = await isVisibleWithin(page.getByText(/some map resources did not load|interactive map unavailable/i).first(), 15000)
    if (!visible) issues.push({ category: 'state-fixture', details: 'Map-resource failure did not expose a degraded or unavailable state' })
  } else if (state === 'pin-request-failure') {
    await isVisibleWithin(page.locator('.maplibregl-map'), 20000)
    const visible = await isVisibleWithin(page.getByText(/couldn.t load map pins/i), 15000)
    if (!visible) issues.push({ category: 'state-fixture', details: 'Pin-request failure did not expose its recovery alert' })
  } else {
    await page.getByRole('button', { name: /find climbing near me/i }).click()
    const expected = state === 'geolocation-success' ? /location found/i : /try location again/i
    const visible = await isVisibleWithin(page.getByRole('button', { name: expected }), 5000)
    if (!visible) issues.push({ category: 'state-fixture', details: `${state} did not reach its expected visible status` })
  }

  return issues
}
