const STORAGE_KEY = 'calino_shown_reminders'
// Longer than the 12-hour catch-up window, including the early live window.
const RETENTION_MS = 24 * 60 * 60 * 1000

export function loadReminderHistory(): Map<string, number> {
  try {
    const entries: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(entries)) return new Map()
    return new Map(
      entries.filter(
        (entry): entry is [string, number] =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          typeof entry[0] === 'string' &&
          typeof entry[1] === 'number' &&
          Number.isFinite(entry[1]) &&
          entry[1] > Date.now() - RETENTION_MS
      )
    )
  } catch {
    return new Map()
  }
}

export function saveReminderHistory(history: Map<string, number>): void {
  for (const [id, trigger] of history) {
    if (trigger <= Date.now() - RETENTION_MS) history.delete(id)
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...history]))
  } catch {
    // Storage can be unavailable; in-memory deduplication still works.
  }
}
