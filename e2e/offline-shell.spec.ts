import { test, expect } from '@playwright/test'
import { clearState } from './fixtures/localstorage'

// Run against a production build with CALINO_ENABLE_SW=true. No accounts are
// seeded: this checks static files and never writes to a live CalDAV server.
const staticUrl = process.env.CALINO_TEST_STATIC_URL

test('the installed app keeps public assets and unopened routes offline', async ({
  page,
  context,
}) => {
  test.skip(!staticUrl, 'CALINO_TEST_STATIC_URL must point to a production build')
  await clearState(page)
  await page.goto(`${staticUrl}/week`)
  await expect(page.locator('[data-component="header"]')).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  const assets = ['/web-app-manifest-512x512.png', '/themes/bauhaus.css']
  if (process.env.CALINO_TEST_BRAND_ASSET) assets.push(process.env.CALINO_TEST_BRAND_ASSET)
  for (const asset of assets) {
    await expect
      .poll(() =>
        page.evaluate(async (path) => {
          const cached = await caches.match(new URL(path, location.origin).href)
          return cached?.ok ?? false
        }, asset)
      )
      .toBe(true)
  }

  await context.setOffline(true)
  for (const asset of assets) {
    expect(await page.evaluate(async (path) => (await fetch(path)).ok, asset)).toBe(true)
  }
  await page.goto(`${staticUrl}/settings`)
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
})
