import { AUDIT_ROUTES, AUDIT_VIEWPORTS, auditRenderedPage, exerciseRuntimeState, expect, test } from './fixtures/runtime-audit'

test.describe('production-safe mobile runtime audit', () => {
  test.skip(process.env.RUNTIME_AUDIT_RUN !== 'true', 'Set RUNTIME_AUDIT_RUN=true to run the production-safe runtime audit')
  test.setTimeout(60_000)

  for (const viewport of AUDIT_VIEWPORTS) {
    for (const route of AUDIT_ROUTES) {
      test(`@production-audit route=${route} viewport=${viewport.label}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport)
        await page.goto(route, { waitUntil: 'domcontentloaded' })
        await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15000 })
        await auditRenderedPage(page, testInfo, route, 'default', viewport)
      })
    }
  }

  const nightlyViewport = AUDIT_VIEWPORTS.find(({ label }) => label === 'mobile-390')
  if (!nightlyViewport) throw new Error('The production audit requires the mobile-390 viewport')

  for (const state of ['webgl-failure', 'map-resource-failure', 'offline-network', 'pin-request-failure', 'geolocation-success', 'geolocation-error', 'geolocation-timeout'] as const) {
    test(`@production-audit state=${state} viewport=${nightlyViewport.label}`, async ({ page, context }, testInfo) => {
      await page.setViewportSize(nightlyViewport)
      const fixtureIssues = await exerciseRuntimeState(page, context, state)
      await auditRenderedPage(page, testInfo, '/', state, nightlyViewport, fixtureIssues)
    })
  }
})
