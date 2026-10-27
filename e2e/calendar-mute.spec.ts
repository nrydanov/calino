import { test, expect } from '@playwright/test'
import { clearState, seedAccount } from './fixtures/localstorage'

test.describe('Sidebar — muting a calendar', () => {
  test('the bell beside a calendar mutes its reminders and keeps it visible', async ({
    page,
    baseURL,
  }) => {
    await clearState(page)
    await seedAccount(page, {
      id: 'mock-account',
      name: 'Mock Radicale',
      serverUrl: `${baseURL}/mock-caldav/dav/`,
      username: 'user',
      password: 'pass',
      calendars: [
        { id: 'personal', name: 'Personal', path: 'calendars/user/personal/', isDefault: true },
      ],
    })

    await page.goto('/month')
    const section = page.locator('[data-component="calendar-section-toggle"]')
    if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click()

    const bell = page.locator(
      '[data-component="calendar-mute-toggle"][data-calendar-id="personal"]'
    )
    const visible = page.locator(
      '[data-component="calendar-visibility-toggle"][data-calendar-id="personal"]'
    )
    await expect(bell).toHaveAttribute('aria-pressed', 'false')
    await expect(bell).toHaveAccessibleName('Mute Reminders')

    await bell.click()
    await expect(bell).toHaveAttribute('aria-pressed', 'true')
    await expect(bell).toHaveAccessibleName('Unmute Reminders')
    await expect(visible).toBeChecked()

    await page.reload()
    if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click()
    await expect(bell).toHaveAttribute('aria-pressed', 'true')

    await bell.click()
    await expect(bell).toHaveAttribute('aria-pressed', 'false')
  })
})
