import { useEffect } from 'react'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import { getAllAccounts } from '@/features/caldav/sync/accountStorage'
import {
  enableServerPushWithTest,
  isRegistered,
  isStandalone,
  pushAvailability,
  serverPublicKey,
} from '@/lib/serverPush'

const DISMISSED_KEY = 'calino_server_push_offer_dismissed'
/** Let the calendar draw and sync start before anything is asked. */
const OFFER_DELAY_MS = 3000

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Offers once, in a toast, the reminders of an account whose server sends them
 * as Web Push and that this browser is not subscribed to. The offer is for a
 * phone and for the installed app: in a tab on a desktop it would hang over
 * the calendar of someone who only came to look, and the settings still have
 * it. "Not now" is remembered.
 */
export function useServerPushOffer(): void {
  useEffect(() => {
    if (pushAvailability() !== 'ok' || dismissed()) return
    if (!isStandalone() && !matchMedia('(pointer: coarse)').matches) return

    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        for (const account of getAllAccounts()) {
          // Fetched before the tap: Safari refuses to subscribe once the
          // gesture has been spent on network waits.
          const publicKey = await serverPublicKey(account)
          if (!publicKey || (await isRegistered(account)) || cancelled) continue
          const t = (key: string, options?: Record<string, unknown>): string =>
            i18n.t(`settings:notifications.serverPush.${key}`, options ?? {})
          toast(t('offer', { name: account.name }), {
            duration: Infinity,
            action: {
              label: t('turnOn'),
              onClick: () => {
                enableServerPushWithTest(account, publicKey)
                  .then(() => toast.success(t('enabled')))
                  .catch((error: unknown) =>
                    toast.error(
                      t('failed', { error: error instanceof Error ? error.message : error }),
                      { duration: 8000 }
                    )
                  )
              },
            },
            cancel: {
              label: t('notNow'),
              onClick: () => {
                try {
                  localStorage.setItem(DISMISSED_KEY, '1')
                } catch {
                  // Without storage the offer returns next time; nothing breaks.
                }
              },
            },
          })
          return
        }
      })()
    }, OFFER_DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])
}
