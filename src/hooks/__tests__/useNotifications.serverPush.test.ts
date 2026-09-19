import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNotifications } from '../useNotifications'
import { useServerPushStore } from '@/store/serverPushStore'
import type { CalendarEvent } from '@/types'

const mockShowNotification = vi.fn()

vi.mock('sonner', () => ({ toast: vi.fn() }))

vi.mock('@/lib/notifications', () => ({
  showNotification: (...args: unknown[]) => mockShowNotification(...args),
  createNotificationId: (eventId: string, reminderId: string) => `calino-${eventId}-${reminderId}`,
  getDueSnoozedReminders: () => [],
  snoozeReminder: vi.fn(),
  getEffectiveReminders: (event: CalendarEvent) => event.reminders ?? [],
}))

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
    useServerPushStore.setState({ accountIds: [] })
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'granted' },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
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
})
