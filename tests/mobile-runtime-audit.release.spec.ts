import { AUDIT_VIEWPORTS, auditRenderedPage, exerciseRuntimeState, test } from './fixtures/runtime-audit'

test.describe('release mobile runtime state audit', () => {
  test.skip(process.env.RUNTIME_AUDIT_RUN !== 'true', 'Set RUNTIME_AUDIT_RUN=true to run the release runtime audit')
  test.setTimeout(60_000)

  for (const viewport of AUDIT_VIEWPORTS) {
    for (const state of ['webgl-failure', 'map-resource-failure', 'offline-network', 'pin-request-failure', 'geolocation-success', 'geolocation-error', 'geolocation-timeout'] as const) {
      test(`@release-audit state=${state} viewport=${viewport.label}`, async ({ page, context }, testInfo) => {
        await page.setViewportSize(viewport)
        const fixtureIssues = await exerciseRuntimeState(page, context, state)
        await auditRenderedPage(page, testInfo, '/', state, viewport, fixtureIssues)
      })
    }
  }

  for (const viewport of AUDIT_VIEWPORTS.filter(({ width }) => width <= 430)) {
    test(`@release-audit throttled-route viewport=${viewport.label}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport)
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() === 'document') await new Promise((resolve) => setTimeout(resolve, 400))
        await route.fallback()
      })
      await page.goto('/gb/harrisons-rocks/giants-ear', { waitUntil: 'domcontentloaded' })
      await auditRenderedPage(page, testInfo, '/gb/harrisons-rocks/giants-ear', 'default', viewport)
    })
  }
})
