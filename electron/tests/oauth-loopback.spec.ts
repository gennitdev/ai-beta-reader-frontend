import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerOAuthLoopbackHandlers } from '../src/oauth-loopback'
import {
  getIpcHandler as getRegisteredHandler,
  ipcMain,
  resetElectronMock,
  shell,
} from './mocks/electron'

const httpMock = vi.hoisted(() => {
  class MockResponse {
    status = 0
    body = ''

    writeHead(status: number) {
      this.status = status
    }

    end(body = '') {
      this.body = body
    }
  }

  class MockServer {
    private errorHandler: ((error: Error) => void) | null = null

    constructor(
      private readonly requestHandler?: (
        request: { url: string },
        response: MockResponse,
      ) => void | Promise<void>,
    ) {}

    listen(_port: number, _host: string, callback: () => void) {
      callback()
      return this
    }

    address() {
      return { port: 43123 }
    }

    close(callback?: () => void) {
      callback?.()
      return this
    }

    on(event: string, handler: (error: Error) => void) {
      if (event === 'error') this.errorHandler = handler
      return this
    }

    async request(url: string) {
      if (!this.requestHandler) throw new Error('Server has no request handler')
      const response = new MockResponse()
      await this.requestHandler({ url }, response)
      return response
    }

    fail(error: Error) {
      this.errorHandler?.(error)
    }
  }

  const servers: MockServer[] = []
  return {
    createServer: vi.fn((handler?: ConstructorParameters<typeof MockServer>[0]) => {
      const server = new MockServer(handler)
      servers.push(server)
      return server
    }),
    latestServer: () => {
      const server = servers.at(-1)
      if (!server) throw new Error('No HTTP server created')
      return server
    },
    reset: () => { servers.length = 0 },
  }
})

vi.mock('node:http', () => ({ createServer: httpMock.createServer }))

const authenticate = () => getRegisteredHandler('oauth-loopback:authenticate')(
  null,
  { clientId: 'desktop-client', clientSecret: 'desktop-secret', scope: 'drive.file profile' },
)

const waitForAuthUrl = async () => {
  await vi.waitFor(() => expect(shell.openExternal).toHaveBeenCalledOnce())
  return new URL(shell.openExternal.mock.calls[0][0])
}

const requestCallback = (callbackUrl: string) => {
  const parsed = new URL(callbackUrl)
  return httpMock.latestServer().request(`${parsed.pathname}${parsed.search}`)
}

describe('Electron OAuth loopback runtime', () => {
  beforeEach(() => {
    resetElectronMock()
    httpMock.reset()
    registerOAuthLoopbackHandlers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('registers the authentication IPC handler', () => {
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'oauth-loopback:authenticate',
      expect.any(Function),
    )
  })

  it('performs a state-bound PKCE exchange and returns tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = authenticate()
    const authUrl = await waitForAuthUrl()
    const state = authUrl.searchParams.get('state')
    const redirectUri = authUrl.searchParams.get('redirect_uri')

    expect(authUrl.origin + authUrl.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(authUrl.searchParams.get('client_id')).toBe('desktop-client')
    expect(authUrl.searchParams.get('scope')).toBe('drive.file profile')
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(state).toBeTruthy()
    expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)

    const callbackResponse = await requestCallback(`${redirectUri}?code=auth-code&state=${state}`)
    const result = await resultPromise

    expect(callbackResponse.status).toBe(200)
    expect(callbackResponse.body).toContain('Authentication Successful')
    expect(result).toEqual({
      success: true,
      tokens: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
      },
    })

    const [tokenUrl, tokenRequest] = fetchMock.mock.calls[0]
    const tokenParams = new URLSearchParams(tokenRequest.body)
    const verifier = tokenParams.get('code_verifier') ?? ''
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token')
    expect(tokenRequest.method).toBe('POST')
    expect(tokenParams.get('code')).toBe('auth-code')
    expect(tokenParams.get('client_secret')).toBe('desktop-secret')
    expect(tokenParams.get('redirect_uri')).toBe(redirectUri)
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      authUrl.searchParams.get('code_challenge'),
    )
  })

  it('rejects state mismatches before exchanging a code', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = authenticate()
    const authUrl = await waitForAuthUrl()
    const redirectUri = authUrl.searchParams.get('redirect_uri') ?? ''
    const response = await requestCallback(`${redirectUri}?code=auth-code&state=wrong-state`)

    expect(response.body).toContain('State mismatch')
    await expect(resultPromise).resolves.toEqual({ success: false, error: 'State mismatch' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not reflect provider errors into the callback HTML', async () => {
    const resultPromise = authenticate()
    const authUrl = await waitForAuthUrl()
    const redirectUri = authUrl.searchParams.get('redirect_uri') ?? ''
    const providerError = '<script>window.pwned=true</script>'
    const response = await requestCallback(
      `${redirectUri}?error=${encodeURIComponent(providerError)}&state=${authUrl.searchParams.get('state')}`,
    )

    expect(response.body).toContain('Authentication was denied')
    expect(response.body).not.toContain(providerError)
    await expect(resultPromise).resolves.toEqual({
      success: false,
      error: `OAuth error: ${providerError}`,
    })
  })

  it('reports missing authorization codes', async () => {
    const resultPromise = authenticate()
    const authUrl = await waitForAuthUrl()
    const redirectUri = authUrl.searchParams.get('redirect_uri') ?? ''
    const response = await requestCallback(
      `${redirectUri}?state=${authUrl.searchParams.get('state')}`,
    )

    expect(response.body).toContain('No authorization code')
    await expect(resultPromise).resolves.toEqual({
      success: false,
      error: 'No authorization code',
    })
  })

  it('preserves structured token-provider errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'invalid_grant',
      error_description: 'Authorization code expired',
    }), { status: 400 })))

    const resultPromise = authenticate()
    const authUrl = await waitForAuthUrl()
    const response = await requestCallback(
      `${authUrl.searchParams.get('redirect_uri')}?code=expired&state=${authUrl.searchParams.get('state')}`,
    )

    expect(response.body).toContain('Failed to exchange authorization code')
    await expect(resultPromise).resolves.toEqual({
      success: false,
      error: 'Token exchange failed: invalid_grant - Authorization code expired',
    })
  })

  it('returns browser launch failures instead of waiting for the OAuth timeout', async () => {
    shell.openExternal.mockRejectedValueOnce(new Error('No browser available'))

    await expect(authenticate()).resolves.toEqual({
      success: false,
      error: 'No browser available',
    })
  })
})
