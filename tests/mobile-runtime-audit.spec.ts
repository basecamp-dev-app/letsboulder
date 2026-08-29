import { AUDIT_ROUTES, AUDIT_VIEWPORTS, auditRenderedPage, exerciseRuntimeState, isVisibleWithin, test, type RuntimeAuditIssue } from './fixtures/runtime-audit'

test.describe('production-safe mobile runtime audit', () => {
  test.skip(process.env.RUNTIME_AUDIT_RUN !== 'true', 'Set RUNTIME_AUDIT_RUN=true to run the production-safe runtime audit')
  test.setTimeout(60_000)

  for (const viewport of AUDIT_VIEWPORTS) {
    for (const route of AUDIT_ROUTES) {
      test(`@production-audit route=${route} viewport=${viewport.label}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport)
        await page.goto(route, { waitUntil: 'domcontentloaded' })
        const issues: RuntimeAuditIssue[] = []
        if (!await isVisibleWithin(page.locator('main#main-content'), 15000)) issues.push({ category: 'state-fixture', details: 'The main landmark did not become visible' })
        if (!await isVisibleWithin(page.getByRole('heading', { level: 1 }), 15000)) issues.push({ category: 'state-fixture', details: 'The route heading did not become visible' })
        await auditRenderedPage(page, testInfo, route, 'default', viewport, issues)
      })
    }
  }

  const nightlyViewport = AUDIT_VIEWPORTS.find(({ label }) => label === 'mobile-390')
  if (!nightlyViewport) throw new Error('The production audit requires the mobile-390 viewport')
  for (const state of ['webgl-failure', 'map-resource-failure', 'offline-network', 'pin-request-failure', 'geolocation-success', 'geolocation-error', 'geolocation-timeout'] as const) {
    test(`@production-audit state=${state} viewport=${nightlyViewport.label}`, async ({ page, context }, testInfo) => {
      await page.setViewportSize(nightlyViewport)
      let fixtureIssues: RuntimeAuditIssue[]
      if (state === 'offline-network') {
        fixtureIssues = []
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        if (!await isVisibleWithin(page.locator('main#main-content'), 15000)) fixtureIssues.push({ category: 'state-fixture', details: 'The main landmark did not become visible' })
        await isVisibleWithin(page.locator('.maplibregl-map'), 20000)
        await context.setOffline(true)
        await page.evaluate(() => {
          Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
          window.dispatchEvent(new Event('offline'))
        })
        if (!await isVisibleWithin(page.getByText(/connection lost\. map updates are unavailable/i), 15000)) fixtureIssues.push({ category: 'state-fixture', details: 'Offline state was exercised but its recovery status was not visible' })
      } else if (state === 'pin-request-failure') {
        fixtureIssues = []
        await page.route('**/api/crags/pins**', route => route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'runtime-audit-pin-request-failure' }),
        }))
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        if (!await isVisibleWithin(page.locator('main#main-content'), 15000)) fixtureIssues.push({ category: 'state-fixture', details: 'The main landmark did not become visible' })
        await isVisibleWithin(page.locator('.maplibregl-map'), 20000)
        if (!await isVisibleWithin(page.getByText(/couldn.t load map pins/i), 30000)) fixtureIssues.push({ category: 'state-fixture', details: 'Pin-request failure did not expose its recovery alert after the query retry cycle' })
      } else {
        fixtureIssues = await exerciseRuntimeState(page, context, state)
      }
      await auditRenderedPage(page, testInfo, '/', state, nightlyViewport, fixtureIssues)
    })
  }
})
