import { create } from 'zustand'

export const REGISTERED_SERVER_PUSH_KEY = 'calino_server_push_registered'

function savedAccountIds(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(REGISTERED_SERVER_PUSH_KEY) ?? '{}')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return []
    return Object.entries(saved)
      .filter(([, endpoint]) => typeof endpoint === 'string' && endpoint.length > 0)
      .map(([id]) => id)
  } catch {
    return []
  }
}

/**
 * Runtime (not persisted) record of the accounts whose server sends this
 * browser's reminders as Web Push (src/lib/serverPush.ts).
 *
 * It exists so `useNotifications` can stand down for those accounts, the way
 * it does for the Android calendar mirror: the page's own timer would remind
 * of the same event again while Calino is open. An account enters only once
 * its server has accepted this browser's subscription in this run. Persisting
 * confirmed ownership would be wrong: the server can drop a subscription
 * behind our back. Saved subscriptions only pause local reminders while
 * startup confirmation is pending; failure restores local reminders.
 */
interface ServerPushState {
  /** Ids of the accounts whose server confirmed the subscription. */
  accountIds: string[]
  /** Pause local reminders for saved subscriptions until startup confirmation finishes. */
  pendingAccountIds: string[]
  finishConfirmation: (accountId: string) => void
  markServerOwned: (accountId: string) => void
}

export const useServerPushStore = create<ServerPushState>((set) => ({
  accountIds: [],
  pendingAccountIds: savedAccountIds(),
  finishConfirmation: (accountId) =>
    set((state) => ({
      pendingAccountIds: state.pendingAccountIds.filter((id) => id !== accountId),
    })),
  markServerOwned: (accountId) =>
    set((state) =>
      state.accountIds.includes(accountId)
        ? state
        : { accountIds: [...state.accountIds, accountId] }
    ),
}))
