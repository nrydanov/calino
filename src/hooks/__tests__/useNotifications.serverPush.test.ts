import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNotifications } from '../useNotifications'
import { useServerPushStore } from '@/store/serverPushStore'
import type { CalendarEvent } from '@/types'

const mockShowNotification = vi.fn()

vi.mock('sonner', () => ({ toast: vi.fn() }))

vi.mock('@/lib/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications')>()
  return {
    ...actual,
    showNotification: (...args: unknown[]) => mockShowNotification(...args),
    createNotificationId: (eventId: string, reminderId: string) =>
      `calino-${eventId}-${reminderId}`,
    getDueSnoozedReminders: () => [],
    snoozeReminder: vi.fn(),
    getEffectiveReminders: (event: CalendarEvent) => event.reminders ?? [],
  }
})

let currentEvents: CalendarEvent[] = []
const calendars = [
  { id: 'clubs-cal', accountId: 'clubs' },
  { id: 'icloud-cal', accountId: 'icloud' },
]

vi.mock('@/store/calendarStore', () => {
  const useCalendarStore = (
    selector: (s: { events: CalendarEvent[]; calendars: unknown[] }) => unknown
  ) => selector({ events: currentEvents, calendars })
  useCalendarStore.getState = () => ({ getEventsForDateRange: () => currentEvents })
  return { useCalendarStore }
})

vi.mock('@/store/settingsStore', () => {
  const useSettingsStore = (selector: (s: { enableDesktopNotifications: boolean }) => unknown) =>
    selector({ enableDesktopNotifications: true })
  useSettingsStore.getState = () => ({ timeFormat: '24h' as const })
  return { useSettingsStore }
})

function eventIn(id: string, calendarId: string): CalendarEvent {
  const start = new Date(Date.now() + 15 * 60_000)
  return {
    id,
    calendarId,
    title: `Event ${id}`,
    start: start.toISOString(),
    end: new Date(start.getTime() + 60 * 60_000).toISOString(),
    isAllDay: false,
    type: 'event',
    reminders: [{ id: 'rem1', minutesBefore: 15, method: 'popup' }],
  }
}

describe('useNotifications - reminders the server sends as Web Push', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useServerPushStore.setState({ accountIds: [], pendingAccountIds: [] })
    const stored = new Map<string, string>()
    vi.mocked(localStorage.getItem).mockImplementation((key) => stored.get(key) ?? null)
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
      stored.set(key, value)
    })
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'granted' },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.mocked(localStorage.getItem).mockReset()
    vi.mocked(localStorage.setItem).mockReset()
    vi.useRealTimers()
  })

  it('stands down for the calendars of an account whose server sends them', () => {
    currentEvents = [eventIn('club-meeting', 'clubs-cal'), eventIn('dentist', 'icloud-cal')]
    useServerPushStore.getState().markServerOwned('clubs')

    renderHook(() => useNotifications())

    expect(mockShowNotification).toHaveBeenCalledTimes(1)
    expect(mockShowNotification).toHaveBeenCalledWith(
      'Event dentist',
      expect.any(String),
      'dentist',
      expect.any(String)
    )
  })

  it('reminds of every account until a server confirms its subscription', () => {
    currentEvents = [eventIn('club-meeting', 'clubs-cal')]

    renderHook(() => useNotifications())

    expect(mockShowNotification).toHaveBeenCalledTimes(1)
  })

  it('stops for an account as soon as its server takes the reminders over', () => {
    currentEvents = [eventIn('club-meeting', 'clubs-cal')]
    const { rerender } = renderHook(() => useNotifications())
    expect(mockShowNotification).toHaveBeenCalledTimes(1)

    act(() => {
      useServerPushStore.getState().markServerOwned('clubs')
    })
    currentEvents = [eventIn('club-meeting-2', 'clubs-cal')]
    rerender()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(mockShowNotification).toHaveBeenCalledTimes(1)
  })

  it('does not repeat a catch-up reminder after reopening the app', () => {
    currentEvents = [eventIn('reopen', 'icloud-cal')]
    currentEvents[0].start = new Date(Date.now() - 60 * 60_000).toISOString()
    const first = renderHook(() => useNotifications())
    expect(mockShowNotification).toHaveBeenCalledTimes(1)
    first.unmount()
    renderHook(() => useNotifications())
    expect(mockShowNotification).toHaveBeenCalledTimes(1)
  })

  it('waits for saved push subscriptions without delaying other accounts', () => {
    currentEvents = [eventIn('club-meeting', 'clubs-cal'), eventIn('dentist', 'icloud-cal')]
    useServerPushStore.setState({ pendingAccountIds: ['clubs'] })
    renderHook(() => useNotifications())
    expect(mockShowNotification.mock.calls.map(([title]) => title)).toEqual(['Event dentist'])
    act(() => {
      useServerPushStore.getState().markServerOwned('clubs')
      useServerPushStore.getState().finishConfirmation('clubs')
    })
    expect(mockShowNotification).toHaveBeenCalledTimes(1)
  })

  it('falls back to local reminders when startup confirmation fails', () => {
    currentEvents = [eventIn('club-meeting', 'clubs-cal')]
    useServerPushStore.setState({ pendingAccountIds: ['clubs'] })
    renderHook(() => useNotifications())
    expect(mockShowNotification).not.toHaveBeenCalled()
    act(() => useServerPushStore.getState().finishConfirmation('clubs'))
    expect(mockShowNotification).toHaveBeenCalledTimes(1)
  })

  it('still reminds after reopening when an event trigger changes', () => {
    currentEvents = [eventIn('edited', 'icloud-cal')]
    const first = renderHook(() => useNotifications())
    first.unmount()
    currentEvents[0].start = new Date(Date.now() + 15.5 * 60_000).toISOString()
    renderHook(() => useNotifications())
    expect(mockShowNotification).toHaveBeenCalledTimes(2)
  })
})
