import { create } from 'zustand'

/**
 * Runtime (not persisted) record of the accounts whose server sends this
 * browser's reminders as Web Push (src/lib/serverPush.ts).
 *
 * It exists so `useNotifications` can stand down for those accounts, the way
 * it does for the Android calendar mirror: the page's own timer would remind
 * of the same event again while Calino is open. An account enters only once
 * its server has accepted this browser's subscription in this run. Persisting
 * it would be wrong: the server can drop a subscription behind our back.
 */
interface ServerPushState {
  /** Ids of the accounts whose server confirmed the subscription. */
  accountIds: string[]
  markServerOwned: (accountId: string) => void
}

export const useServerPushStore = create<ServerPushState>((set) => ({
  accountIds: [],
  markServerOwned: (accountId) =>
    set((state) =>
      state.accountIds.includes(accountId)
        ? state
        : { accountIds: [...state.accountIds, accountId] }
    ),
}))
