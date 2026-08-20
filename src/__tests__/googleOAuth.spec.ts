import { beforeEach, describe, expect, it, vi } from 'vitest'

const oauthMocks = vi.hoisted(() => ({
  appUrlOpen: undefined as ((event: { url: string }) => Promise<void>) | undefined,
  browserFinished: undefined as (() => Promise<void>) | undefined,
  appRemove: vi.fn(async () => {}),
  browserRemove: vi.fn(async () => {}),
  browserOpen: vi.fn(async () => {}),
  browserClose: vi.fn(async () => {}),
  launcherOpen: vi.fn(async () => ({ completed: true })),
  httpPost: vi.fn(),
  browserPluginAvailable: true,
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (_event: string, callback: (event: { url: string }) => Promise<void>) => {
      oauthMocks.appUrlOpen = callback
      return { remove: oauthMocks.appRemove }
    }),
  },
}))

vi.mock('@capacitor/browser', () => ({
  Browser: {
    addListener: vi.fn(async (_event: string, callback: () => Promise<void>) => {
      oauthMocks.browserFinished = callback
      return { remove: oauthMocks.browserRemove }
    }),
    open: oauthMocks.browserOpen,
    close: oauthMocks.browserClose,
  },
}))

vi.mock('@capacitor/app-launcher', () => ({
  AppLauncher: { openUrl: oauthMocks.launcherOpen },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: vi.fn(() => oauthMocks.browserPluginAvailable) },
  CapacitorHttp: { post: oauthMocks.httpPost },
}))

vi.mock('@/lib/logger', () => ({ logger: { log: vi.fn() } }))

import { isMatchingRedirect, performNativeGoogleOAuth } from '@/lib/googleOAuth'

const config = {
  clientId: 'native-client-id',
  redirectUri: 'com.example.app:/oauth2redirect',
  scope: 'drive.file',
}

async function waitForAuthUrl(): Promise<URL> {
  await vi.waitFor(() => expect(oauthMocks.browserOpen).toHaveBeenCalledOnce())
  const [{ url }] = oauthMocks.browserOpen.mock.calls[0]
  return new URL(url)
}

beforeEach(() => {
  vi.clearAllMocks()
  oauthMocks.appUrlOpen = undefined
  oauthMocks.browserFinished = undefined
  oauthMocks.browserPluginAvailable = true
  oauthMocks.launcherOpen.mockResolvedValue({ completed: true })
  oauthMocks.httpPost.mockResolvedValue({
    status: 200,
    data: { access_token: 'access-123', refresh_token: 'refresh-123', expires_in: 3600 },
  })
})

describe('isMatchingRedirect', () => {
  const httpsRedirect = 'https://www.beta-bot.net/oauth2redirect'
  const nativeRedirect = 'com.googleusercontent.apps.abc123:/oauth2redirect'

  it('matches the exact redirect with the OAuth query appended', () => {
    expect(isMatchingRedirect(`${httpsRedirect}?code=abc&state=xyz`, httpsRedirect)).toBe(true)
  })

  it('matches a custom-scheme (native) redirect with query appended', () => {
    expect(isMatchingRedirect(`${nativeRedirect}?code=abc&state=xyz`, nativeRedirect)).toBe(true)
  })

  it('rejects a different host', () => {
    expect(isMatchingRedirect('https://evil.example/oauth2redirect?code=abc', httpsRedirect)).toBe(false)
  })

  it('rejects a different scheme', () => {
    expect(isMatchingRedirect('http://www.beta-bot.net/oauth2redirect', httpsRedirect)).toBe(false)
  })

  it('rejects a URL that merely shares the redirect as a string prefix', () => {
    expect(isMatchingRedirect('https://www.beta-bot.net/oauth2redirect-evil?code=abc', httpsRedirect)).toBe(false)
    expect(isMatchingRedirect('https://www.beta-bot.net.evil.example/oauth2redirect', httpsRedirect)).toBe(false)
  })

  it('rejects a malformed URL', () => {
    expect(isMatchingRedirect('not a url', httpsRedirect)).toBe(false)
  })
})

describe('performNativeGoogleOAuth', () => {
  it('runs PKCE, validates state, exchanges the code, and cleans up listeners', async () => {
    const authentication = performNativeGoogleOAuth(config)
    const authUrl = await waitForAuthUrl()

    expect(authUrl.origin + authUrl.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(authUrl.searchParams.get('client_id')).toBe(config.clientId)
    expect(authUrl.searchParams.get('redirect_uri')).toBe(config.redirectUri)
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authUrl.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/)

    await oauthMocks.appUrlOpen?.({
      url: `${config.redirectUri}?code=authorization-code&state=${authUrl.searchParams.get('state')}`,
    })

    await expect(authentication).resolves.toEqual(expect.objectContaining({ access_token: 'access-123' }))
    expect(oauthMocks.browserClose).toHaveBeenCalledOnce()
    expect(oauthMocks.appRemove).toHaveBeenCalledOnce()
    expect(oauthMocks.browserRemove).toHaveBeenCalledOnce()

    const [request] = oauthMocks.httpPost.mock.calls[0]
    const body = new URLSearchParams(request.data)
    expect(request.url).toBe('https://oauth2.googleapis.com/token')
    expect(body.get('code')).toBe('authorization-code')
    expect(body.get('code_verifier')).toMatch(/^[\w-]{86}$/)
    expect(body.has('client_secret')).toBe(false)
  })

  it.each([
    ['an authorization error', '?error=access_denied&state={state}', /Authorization error: access_denied/],
    ['a missing code', '?state={state}', /missing code parameter/],
    ['a state mismatch', '?code=abc&state=wrong', /state parameter mismatch/],
  ])('rejects %s from the redirect', async (_label, suffix, expected) => {
    const authentication = performNativeGoogleOAuth(config)
    const authUrl = await waitForAuthUrl()
    const redirect = `${config.redirectUri}${suffix.replace('{state}', authUrl.searchParams.get('state') ?? '')}`

    await oauthMocks.appUrlOpen?.({ url: redirect })

    await expect(authentication).rejects.toThrow(expected)
    expect(oauthMocks.httpPost).not.toHaveBeenCalled()
    expect(oauthMocks.browserClose).toHaveBeenCalledOnce()
  })

  it('rejects browser cancellation and ignores unrelated deep links', async () => {
    const authentication = performNativeGoogleOAuth(config)
    await waitForAuthUrl()

    await oauthMocks.appUrlOpen?.({ url: 'https://evil.example/oauth2redirect?code=stolen' })
    expect(oauthMocks.httpPost).not.toHaveBeenCalled()
    await oauthMocks.browserFinished?.()

    await expect(authentication).rejects.toThrow('User cancelled sign-in')
  })

  it('uses the system launcher fallback and rejects an unsuccessful launch', async () => {
    oauthMocks.browserPluginAvailable = false
    oauthMocks.launcherOpen.mockResolvedValue({ completed: false })

    await expect(performNativeGoogleOAuth(config)).rejects.toThrow(
      'Failed to open system browser for authentication',
    )
    expect(oauthMocks.browserOpen).not.toHaveBeenCalled()
    expect(oauthMocks.browserClose).not.toHaveBeenCalled()
    expect(oauthMocks.appRemove).toHaveBeenCalledOnce()
  })

  it('surfaces token endpoint failures without exposing a client secret', async () => {
    oauthMocks.httpPost.mockResolvedValue({ status: 401, data: { error: 'invalid_grant' } })
    const authentication = performNativeGoogleOAuth(config)
    const authUrl = await waitForAuthUrl()
    await oauthMocks.appUrlOpen?.({
      url: `${config.redirectUri}?code=expired&state=${authUrl.searchParams.get('state')}`,
    })

    await expect(authentication).rejects.toThrow(
      'Token exchange failed with status 401: {"error":"invalid_grant"}',
    )
    const body = new URLSearchParams(oauthMocks.httpPost.mock.calls[0][0].data)
    expect(body.has('client_secret')).toBe(false)
  })

  it('rejects successful token responses without an access token', async () => {
    oauthMocks.httpPost.mockResolvedValue({ status: 200, data: { expires_in: 3600 } })
    const authentication = performNativeGoogleOAuth(config)
    const authUrl = await waitForAuthUrl()
    await oauthMocks.appUrlOpen?.({
      url: `${config.redirectUri}?code=abc&state=${authUrl.searchParams.get('state')}`,
    })

    await expect(authentication).rejects.toThrow('missing access_token')
  })
})
