import { expect, test } from '@playwright/test'
import { clearState, seedAccount, STORAGE_KEYS } from './fixtures/localstorage'

test.describe('desktop notification assets', () => {
  test('serves the icon used by browser reminders', async ({ page }) => {
    const response = await page.goto('/apple-touch-icon.png')

    expect(response?.ok()).toBe(true)
    expect(response?.headers()['content-type']).toContain('image/png')
  })
})

test('saved push subscription pauses local reminders until confirmation fails', async ({
  page,
  baseURL,
}) => {
  await clearState(page)
  await seedAccount(page, {
    id: 'push-account',
    name: 'Push account',
    serverUrl: `${baseURL}/mock-caldav/`,
    username: 'test',
    password: 'test',
  })
  let releaseConfirmation!: () => void
  const confirmation = new Promise<void>((resolve) => {
    releaseConfirmation = resolve
  })
  await page.route('**/push/subscribe', async (route) => {
    await confirmation
    await route.fulfill({ status: 503, body: '' })
  })
  await page.addInitScript(
    ({ calendarKey }) => {
      const endpoint = 'https://push.example.test/subscription'
      localStorage.setItem(
        'calino_server_push_registered',
        JSON.stringify({ 'push-account': endpoint })
      )
      Object.defineProperty(window, 'pushManager', {
        value: {
          getSubscription: async () => ({ endpoint, toJSON: () => ({ endpoint }) }),
        },
      })
      const now = Date.now()
      const calendars = ['local', 'server'].map((id) => ({
        id,
        name: id,
        color: '#4285F4',
        isVisible: true,
        isDefault: id === 'local',
        ...(id === 'server' ? { accountId: 'push-account' } : {}),
      }))
      const events = calendars.map((calendar) => ({
        id: calendar.id,
        calendarId: calendar.id,
        title: calendar.id === 'local' ? 'Local reminder' : 'Server reminder',
        start: new Date(now + 15 * 60_000).toISOString(),
        end: new Date(now + 75 * 60_000).toISOString(),
        isAllDay: false,
        type: 'event',
        reminders: [{ id: 'reminder', minutesBefore: 15, method: 'popup' }],
      }))
      localStorage.setItem(
        calendarKey,
        JSON.stringify({ state: { calendars, events }, version: 2 })
      )
      ;(window as unknown as { reminderTitles: string[] }).reminderTitles = []
      class MockNotification {
        static permission = 'granted'
        onclick: (() => void) | null = null
        constructor(title: string) {
          ;(window as unknown as { reminderTitles: string[] }).reminderTitles.push(title)
        }
        close() {}
      }
      Object.defineProperty(window, 'Notification', { value: MockNotification, configurable: true })
    },
    { calendarKey: STORAGE_KEYS.calendar }
  )
  await page.goto('/')
  const titles = () =>
    page.evaluate(() => (window as unknown as { reminderTitles: string[] }).reminderTitles)
  await expect.poll(titles).toEqual(['Local reminder'])
  releaseConfirmation()
  await expect.poll(titles).toEqual(['Local reminder', 'Server reminder'])
})

test('a reminder says tomorrow and does not repeat after reopening', async ({ page }) => {
  await clearState(page)
  const now = new Date('2026-09-23T12:00:00')
  await page.clock.install({ time: now })
  await page.addInitScript(
    ({ calendarKey }) => {
      const eventStart = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000)
      const event = {
        id: 'tomorrow-reminder',
        calendarId: 'default',
        title: 'Tomorrow appointment',
        start: eventStart.toISOString(),
        end: eventEnd.toISOString(),
        isAllDay: false,
        type: 'event',
        reminders: [{ id: 'day-before', minutesBefore: 1440, method: 'popup' }],
      }
      const raw = localStorage.getItem(calendarKey)
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 2 }
      const reopening = sessionStorage.getItem('reminder-seeded') === '1'
      sessionStorage.setItem('reminder-seeded', '1')
      const nextEvent = reopening
        ? { ...event, id: 'new-reminder', title: 'New appointment' }
        : event
      parsed.state = { ...parsed.state, events: [...(parsed.state?.events ?? []), nextEvent] }
      localStorage.setItem(calendarKey, JSON.stringify(parsed))
      ;(window as unknown as { reminderBodies: string[] }).reminderBodies = []
      ;(window as unknown as { reminderTitles: string[] }).reminderTitles = []
      class MockNotification {
        static permission = 'granted'
        onclick: (() => void) | null = null
        constructor(title: string, options: { body: string }) {
          ;(window as unknown as { reminderBodies: string[] }).reminderBodies.push(options.body)
          ;(window as unknown as { reminderTitles: string[] }).reminderTitles.push(title)
        }
        close() {}
      }
      Object.defineProperty(window, 'Notification', { value: MockNotification, configurable: true })
    },
    { calendarKey: STORAGE_KEYS.calendar }
  )
  await page.goto('/')
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { reminderBodies: string[] }).reminderBodies)
    )
    .toContainEqual(expect.stringContaining('tomorrow'))
  await page.reload()
  // The new reminder proves that the notification hook has run after reload.
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { reminderTitles: string[] }).reminderTitles)
    )
    .toEqual(['New appointment'])
})
