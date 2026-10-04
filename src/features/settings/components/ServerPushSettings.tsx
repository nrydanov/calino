import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getAllAccounts } from '@/features/caldav/sync/accountStorage'
import type { CalDAVAccount } from '@/features/caldav/types'
import {
  enableServerPushWithTest,
  isRegistered,
  pushAvailability,
  sendServerPushTest,
  serverPublicKey,
} from '@/lib/serverPush'
import styles from './Settings.module.css'

interface PushAccount {
  account: CalDAVAccount
  publicKey: string
  on: boolean
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * One row per account whose server sends reminders as Web Push. Accounts on
 * other servers show nothing, and so does a browser that cannot take a push.
 */
export function ServerPushSettings(): JSX.Element | null {
  const { t } = useTranslation('settings')
  const availability = pushAvailability()
  const [accounts, setAccounts] = useState<PushAccount[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (availability === 'unsupported') return
    let cancelled = false
    void (async () => {
      const found: PushAccount[] = []
      for (const account of getAllAccounts()) {
        const publicKey = await serverPublicKey(account)
        if (publicKey) found.push({ account, publicKey, on: await isRegistered(account) })
      }
      if (!cancelled) setAccounts(found)
    })()
    return () => {
      cancelled = true
    }
  }, [availability])

  if (availability === 'unsupported' || accounts.length === 0) return null

  const turnOn = async (entry: PushAccount): Promise<void> => {
    setBusy(entry.account.id)
    try {
      await enableServerPushWithTest(entry.account, entry.publicKey)
      setAccounts((all) =>
        all.map((a) => (a.account.id === entry.account.id ? { ...a, on: true } : a))
      )
      toast.success(t('notifications.serverPush.enabled'))
    } catch (error) {
      toast.error(t('notifications.serverPush.failed', { error: errorText(error) }), {
        duration: 8000,
      })
    } finally {
      setBusy(null)
    }
  }

  const test = async (entry: PushAccount): Promise<void> => {
    setBusy(entry.account.id)
    try {
      await sendServerPushTest(entry.account)
      toast.success(t('notifications.serverPush.testSent'))
    } catch (error) {
      toast.error(t('notifications.serverPush.testFailed', { error: errorText(error) }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.group} data-component="server-push-settings">
      <div className={styles.groupLabel}>{t('notifications.server')}</div>
      {accounts.map((entry) => (
        <div
          key={entry.account.id}
          className={styles.row}
          data-component="setting-row"
          data-setting="server-push"
          data-value={String(entry.on)}
        >
          <div className={styles.rowInfo}>
            <div className={styles.rowLabel}>{entry.account.name}</div>
            <div className={styles.rowDesc}>
              {availability === 'install-first'
                ? t('notifications.serverPush.descInstallFirst')
                : entry.on
                  ? t('notifications.serverPush.descOn')
                  : t('notifications.serverPush.desc')}
            </div>
          </div>
          {availability === 'ok' && (
            <div className={styles.rowControl}>
              <button
                className={styles.actionBtn}
                onClick={() => void (entry.on ? test(entry) : turnOn(entry))}
                disabled={busy === entry.account.id}
                data-component="action-button"
                data-action={entry.on ? 'server-push-test' : 'server-push-on'}
                type="button"
              >
                {entry.on
                  ? t('notifications.serverPush.sendTest')
                  : t('notifications.serverPush.turnOn')}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
