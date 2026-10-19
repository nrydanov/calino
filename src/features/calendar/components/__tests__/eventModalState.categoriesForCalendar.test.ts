import { describe, it, expect } from 'vitest'
import { categoriesForCalendar } from '../eventModalState'

/**
 * An event offers the categories of its own account. A server that maps
 * categories onto its own tags refuses a name it does not have, so a
 * category seen only on another account's events is not offered.
 */
describe('categories offered on an event', () => {
  const categories = ['Work', 'Club', 'Draft'].map((name) => ({ id: name, name, color: '' }))
  const calendars = [
    { id: 'home', accountId: 'personal' },
    { id: 'club', accountId: 'clubs' },
    { id: 'local' },
  ]
  const events = [
    { calendarId: 'home', categories: ['Work'] },
    { calendarId: 'club', categories: ['Club'] },
  ]
  const offered = (calendarId: string, selected: string[] = []) =>
    categoriesForCalendar(categories, calendars, events, calendarId, selected).map((c) => c.name)

  it("offers the names on the account's events", () => {
    expect(offered('club')).toEqual(['Club'])
  })

  it('keeps a name already on the event', () => {
    expect(offered('club', ['Draft'])).toEqual(['Club', 'Draft'])
  })

  it('offers every category on a local calendar', () => {
    expect(offered('local')).toEqual(['Work', 'Club', 'Draft'])
  })
})
