/**
 * Reminders sent by the CalDAV server as Web Push, for a server that offers
 * them under /push/ beside its CalDAV root: GET key, POST subscribe and POST
 * test, the last two behind the account's own Basic credentials. They reach a
 * phone while Calino is closed, which the page's own timers cannot.
 *
 * On iOS the subscription is made on the window (Declarative Web Push, Safari
 * 18.4+), and only from the app installed on the Home Screen: a subscription
 * made in a Safari tab never reaches that app. Elsewhere it is made through
 * push-sw.js, a worker under a scope of its own that shows the server's
 * notifications and leaves the scope / to Calino's own worker.
 */

import { basicAuthHeader } from '@/features/caldav/client/basicAuth'
import { getCredentialById } from '@/features/caldav/client/credentials'
import type { CalDAVAccount } from '@/features/caldav/types'
import { useServerPushStore } from '@/store/serverPushStore'

const WORKER_URL = '/push-sw.js'
const WORKER_SCOPE = '/push-sw/'
/** The endpoint a server accepted for an account, by account id. */
const REGISTERED_KEY = 'calino_server_push_registered'

/** iOS exposes `navigator.standalone`; nothing else does. */
const onIos = typeof navigator !== 'undefined' && 'standalone' in navigator

interface DeclarativeWindow {
  pushManager?: PushManager
}

function windowPushManager(): PushManager | undefined {
  return (window as unknown as DeclarativeWindow).pushManager
}

/** Running as the app installed on the Home Screen, not in a browser tab. */
export function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    matchMedia('(display-mode: standalone)').matches
  )
}

export type PushAvailability = 'ok' | 'install-first' | 'unsupported'

/** Whether this browser, as it is running now, can take the server's pushes. */
export function pushAvailability(): PushAvailability {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (onIos) {
    if (!windowPushManager()) return 'unsupported'
    return isStandalone() ? 'ok' : 'install-first'
  }
  if (windowPushManager()) return 'ok'
  return 'serviceWorker' in navigator && 'PushManager' in window ? 'ok' : 'unsupported'
}

/**
 * Where the account's server takes subscriptions: /push/ on the origin of its
 * CalDAV URL. An account reached through a CORS proxy is left out, since the
 * proxy forwards WebDAV, not this.
 */
export function pushBase(account: CalDAVAccount): string | null {
  if (account.proxyUrl) return null
  try {
    return new URL('/push/', account.serverUrl).toString()
  } catch {
    return null
  }
}

/** The server's VAPID key, or null when the server sends no reminders. */
export async function serverPublicKey(account: CalDAVAccount): Promise<string | null> {
  const base = pushBase(account)
  if (!base) return null
  try {
    const response = await fetch(`${base}key`)
    if (!response.ok) return null
    const body = (await response.json()) as { publicKey?: unknown }
    return typeof body.publicKey === 'string' ? body.publicKey : null
  } catch {
    return null
  }
}

/**
 * The manager subscriptions are made with. Looking one up does not register
 * the worker, so a browser whose owner never asked for reminders gets none.
 */
async function pushManager(register: boolean): Promise<PushManager | null> {
  const declarative = windowPushManager()
  if (declarative) return declarative
  if (register) {
    const registration = await navigator.serviceWorker.register(WORKER_URL, {
      scope: WORKER_SCOPE,
    })
    return registration.pushManager
  }
  const registration = await navigator.serviceWorker.getRegistration(WORKER_SCOPE)
  return registration?.pushManager ?? null
}

function registeredEndpoints(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(REGISTERED_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function rememberEndpoint(accountId: string, endpoint: string): void {
  try {
    localStorage.setItem(
      REGISTERED_KEY,
      JSON.stringify({ ...registeredEndpoints(), [accountId]: endpoint })
    )
  } catch {
    // A private window may refuse storage; the offer then simply returns.
  }
}

/** Whether this browser's subscription is the one the account's server holds. */
export async function isRegistered(account: CalDAVAccount): Promise<boolean> {
  if (pushAvailability() !== 'ok' || Notification.permission !== 'granted') return false
  const subscription = await (await pushManager(false))?.getSubscription()
  return !!subscription && registeredEndpoints()[account.id] === subscription.endpoint
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded =
    base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

async function authorization(account: CalDAVAccount): Promise<string> {
  const credential = await getCredentialById(account.credentialId)
  if (!credential) throw new Error('credentials not found')
  return basicAuthHeader(credential.username, credential.password)
}

/**
 * Subscribes this browser and hands the subscription to the account's server,
 * under the account's credentials: a person's own account makes it theirs.
 * Call it from a tap, with the key already fetched: Safari refuses to
 * subscribe once the gesture has been spent on network waits.
 */
export async function enableServerPush(account: CalDAVAccount, publicKey: string): Promise<void> {
  const base = pushBase(account)
  if (!base) throw new Error('this account cannot take reminders')
  if ((await Notification.requestPermission()) !== 'granted') {
    throw new Error('notifications are blocked')
  }
  const manager = await pushManager(true)
  if (!manager) throw new Error('push is unavailable')
  const subscription =
    (await manager.getSubscription()) ??
    (await manager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  await handOver(account, base, subscription)
}

/**
 * Gives the subscription to the account's server, which replaces any entry for
 * the same endpoint, and records that the server now sends this account's
 * reminders to this browser.
 */
async function handOver(
  account: CalDAVAccount,
  base: string,
  subscription: PushSubscription
): Promise<void> {
  const response = await fetch(`${base}subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authorization(account),
    },
    body: JSON.stringify(subscription),
  })
  if (!response.ok) throw new Error(`the server answered ${response.status}`)
  rememberEndpoint(account.id, subscription.endpoint)
  useServerPushStore.getState().markServerOwned(account.id)
}

/**
 * Hands this browser's existing subscription to the account's server again,
 * once per run. The browser only remembers having given it; the server may
 * have dropped it since (an expired subscription, a lost state file). Only a
 * server that accepts it again takes the account's reminders over from the
 * page. Returns whether it did; asks for no permission and subscribes to
 * nothing new.
 */
export async function confirmServerPush(account: CalDAVAccount): Promise<boolean> {
  const base = pushBase(account)
  if (!base || !(await isRegistered(account))) return false
  const subscription = await (await pushManager(false))?.getSubscription()
  if (!subscription) return false
  try {
    await handOver(account, base, subscription)
    return true
  } catch {
    return false
  }
}

/** Asks the server for a test notification to this account's subscriptions. */
export async function sendServerPushTest(account: CalDAVAccount): Promise<void> {
  const base = pushBase(account)
  if (!base) return
  const response = await fetch(`${base}test`, {
    method: 'POST',
    headers: { Authorization: await authorization(account) },
  })
  if (!response.ok) throw new Error(`the server answered ${response.status}`)
}

/** Turns reminders on and asks for a test, so the person sees one arrive. */
export async function enableServerPushWithTest(
  account: CalDAVAccount,
  publicKey: string
): Promise<void> {
  await enableServerPush(account, publicKey)
  await sendServerPushTest(account)
}
