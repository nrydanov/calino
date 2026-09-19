import { describe, it, expect, vi, afterEach } from 'vitest'
import { pushBase, serverPublicKey } from '../serverPush'
import type { CalDAVAccount } from '@/features/caldav/types'

function account(serverUrl: string, proxyUrl: string | null = null): CalDAVAccount {
  return {
    id: 'a',
    name: 'Clubs',
    serverUrl,
    proxyUrl,
    username: 'me',
    credentialId: 'c',
    createdAt: '2026-09-19T00:00:00Z',
    lastSyncAt: null,
  }
}

describe('pushBase', () => {
  it('is /push/ on the origin of the CalDAV URL', () => {
    expect(pushBase(account('https://tasks.example.org:8444/dav/'))).toBe(
      'https://tasks.example.org:8444/push/'
    )
  })

  it('leaves out an account reached through a proxy, and a malformed URL', () => {
    expect(pushBase(account('https://x.org/dav/', 'https://proxy.example/'))).toBeNull()
    expect(pushBase(account('not a url'))).toBeNull()
  })
})

describe('serverPublicKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the key a server offers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ publicKey: 'BKey' }), { status: 200 }))
    )
    expect(await serverPublicKey(account('https://x.org/dav/'))).toBe('BKey')
  })

  it('is null for a server that sends no reminders or cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 }))
    )
    expect(await serverPublicKey(account('https://x.org/dav/'))).toBeNull()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    expect(await serverPublicKey(account('https://x.org/dav/'))).toBeNull()
  })
})
