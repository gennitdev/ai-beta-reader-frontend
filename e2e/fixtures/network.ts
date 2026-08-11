import { test as base, type Page, type Route } from '@playwright/test'

/**
 * Network-isolation harness for E2E tests.
 *
 * The app under test is local-first: book/chapter CRUD runs entirely in-browser
 * against sql.js + IndexedDB. Its only external boundaries are OpenAI (AI
 * review/summary) and Google Drive/OAuth (cloud sync). These fixtures stub those
 * boundaries so runs are hermetic — no real account, no real network, no cost —
 * while the code between them (encryption, compression, DB import/export) runs
 * for real.
 *
 * Design:
 *  - `netGuard` runs first and installs a default-deny catch-all: any request to
 *    a non-localhost host that isn't explicitly stubbed is aborted and recorded,
 *    so an un-mocked external call fails loudly instead of hitting the network.
 *  - `drive` and `openai` depend on `netGuard`, so their specific handlers are
 *    registered *after* the catch-all. Playwright runs the most-recently-added
 *    matching handler first, so the specific stubs shadow the guard for their
 *    hosts while everything else still hits the deny-all.
 */

/** Filename the app uses for its Google Drive backup blob. */
export const BACKUP_FILE_NAME = 'ai-beta-reader-backup.enc'

/** Access token our stubbed Google Identity Services hands back. */
const FAKE_ACCESS_TOKEN = 'e2e-fake-access-token'

interface DriveEntry {
  id: string
  content: string
}

/** In-memory stand-in for the user's Google Drive, backed by the Node process. */
export interface DriveStore {
  /** Raw uploaded bytes of the backup file (the encrypted+compressed blob), or undefined. */
  getBackup(): string | undefined
  /** Whether a backup has been uploaded. */
  hasBackup(): boolean
  /** Number of files currently "in Drive". */
  fileCount(): number
  /** Overwrite/insert a file directly (e.g. to simulate a corrupt backup). */
  setFile(name: string, content: string): void
  /** Forget everything. */
  clear(): void
}

export interface NetGuard {
  /** Hosts/URLs that were blocked by the deny-all guard during the test. */
  disallowed: string[]
}

interface NetFixtures {
  netGuard: NetGuard
  drive: DriveStore
  openai: OpenAIMock
}

/** Extract the body of the multipart part named `file` from a Drive upload. */
function extractMultipartFilePart(body: string, contentType: string): string | null {
  const boundaryMatch = /boundary=(.+)$/.exec(contentType)
  if (!boundaryMatch) return null
  const boundary = `--${boundaryMatch[1]}`
  for (const segment of body.split(boundary)) {
    if (!/name="file"/.test(segment)) continue
    const headerEnd = segment.indexOf('\r\n\r\n')
    if (headerEnd === -1) continue
    return segment.slice(headerEnd + 4).replace(/\r\n$/, '')
  }
  return null
}

/** Extract the `name` field from the JSON metadata part of a Drive upload. */
function extractMetadataName(body: string): string | null {
  const match = /"name"\s*:\s*"([^"]+)"/.exec(body)
  return match ? match[1] : null
}

function makeDriveHandler(files: Map<string, DriveEntry>) {
  return async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const json = (data: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })

    // Upload (create = POST, update = PATCH): /upload/drive/v3/files[/{id}]
    if (url.pathname.startsWith('/upload/drive/v3/files')) {
      const contentType = request.headers()['content-type'] ?? ''
      const body = request.postData() ?? ''
      const content = extractMultipartFilePart(body, contentType) ?? ''
      const name = extractMetadataName(body) ?? BACKUP_FILE_NAME
      const existing = files.get(name)
      const id = existing?.id ?? `drive-file-${files.size + 1}`
      files.set(name, { id, content })
      return json({ id, name })
    }

    // Search by name: GET /drive/v3/files?q=name='...'
    if (url.pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') ?? ''
      const nameMatch = /name='([^']+)'/.exec(q)
      const name = nameMatch?.[1]
      const entry = name ? files.get(name) : undefined
      return json({ files: entry ? [{ id: entry.id, name }] : [] })
    }

    // Download media: GET /drive/v3/files/{id}?alt=media
    const mediaMatch = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)
    if (mediaMatch && url.searchParams.get('alt') === 'media') {
      const id = mediaMatch[1]
      const entry = [...files.values()].find((f) => f.id === id)
      if (!entry) return route.fulfill({ status: 404, body: 'Not found' })
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: entry.content })
    }

    // Any other Drive call is unexpected — surface it rather than hit the network.
    return route.fulfill({ status: 500, body: `Unexpected Drive request: ${url.href}` })
  }
}

/** Install the stubbed Google Identity Services token client before app code runs. */
async function stubGoogleIdentityServices(page: Page): Promise<void> {
  await page.addInitScript((token: string) => {
    const w = window as unknown as {
      google?: { accounts?: { oauth2?: unknown } }
    }
    w.google = {
      accounts: {
        oauth2: {
          initTokenClient(config: { callback: (r: { access_token: string }) => void }) {
            return {
              requestAccessToken() {
                // Resolve the OAuth flow synchronously with a fake token.
                config.callback({ access_token: token })
              },
            }
          },
        },
      },
    }
  }, FAKE_ACCESS_TOKEN)
}

/** Shape the app expects back from a chapter-summary completion. */
export interface SummaryPayload {
  summary: string
  pov: string | null
  characters: string[]
  locations: string[]
  beats: string[]
  spoilers_ok: boolean
}

export interface OpenAIMock {
  /** Override the plain-text response used for review generation. */
  setReview(text: string): void
  /** Override the JSON payload used for summary generation. */
  setSummary(summary: Partial<SummaryPayload>): void
  /** Number of chat-completion calls intercepted. */
  callCount(): number
}

const DEFAULT_SUMMARY: SummaryPayload = {
  summary: 'Alice confronts Bob at the tower as an old secret surfaces.',
  pov: 'Third person limited',
  characters: ['Alice', 'Bob'],
  locations: ['The Tower'],
  beats: ['Alice arrives at the tower', 'Bob reveals the secret'],
  spoilers_ok: true,
}

const DEFAULT_REVIEW =
  'This chapter crackles with tension. The pacing is tight and the dialogue sings — a compelling read.'

export const test = base.extend<NetFixtures>({
  // Autouse: every E2E test is hermetic by default. Injects the GIS stub (so the
  // app never loads Google's real script on boot) and a default-deny guard for
  // all non-localhost hosts.
  netGuard: [
    async ({ page }, use) => {
      const disallowed: string[] = []

      await stubGoogleIdentityServices(page)

      // Registered first → evaluated last. Localhost passes through to the dev
      // server; every other host is denied unless a later, more-specific handler
      // (drive/openai) claims it first.
      await page.route('**/*', async (route) => {
        const host = new URL(route.request().url()).hostname
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
          return route.continue()
        }
        disallowed.push(route.request().url())
        return route.abort()
      })

      // Google Fonts is a real external dependency of the app shell. Stub it with
      // empty CSS (registered after the guard so it wins) so tests stay hermetic
      // and offline — the actual typeface is irrelevant to behaviour, and an
      // empty stylesheet means no follow-on gstatic font-file requests.
      await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, (route) =>
        route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
      )

      await use({ disallowed })

      // Teardown: fail loudly if the app reached for any external host that
      // wasn't explicitly stubbed. Aborting alone isn't enough — a silently
      // dropped request could mask a real leak (telemetry, a CDN font, an
      // un-mocked API call). Every external boundary must be intentional.
      if (disallowed.length > 0) {
        const unique = [...new Set(disallowed)]
        throw new Error(
          `Un-mocked external request(s) were blocked during this test:\n  ${unique.join('\n  ')}\n` +
            'Add a stub for these hosts (see e2e/fixtures/network.ts) or remove the call.',
        )
      }
    },
    { auto: true },
  ],

  drive: async ({ page, netGuard }, use) => {
    void netGuard // force guard setup to run first
    const files = new Map<string, DriveEntry>()

    await page.route('https://www.googleapis.com/**', makeDriveHandler(files))
    // If GIS ever tries to load its script despite the init-script stub, serve
    // an empty script so nothing reaches the real network.
    await page.route('https://accounts.google.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
    )

    await use({
      getBackup: () => files.get(BACKUP_FILE_NAME)?.content,
      hasBackup: () => files.has(BACKUP_FILE_NAME),
      fileCount: () => files.size,
      setFile: (name, content) => files.set(name, { id: `drive-file-${files.size + 1}`, content }),
      clear: () => files.clear(),
    })
  },

  openai: async ({ page, netGuard }, use) => {
    void netGuard // force guard setup to run first
    let summary: SummaryPayload = { ...DEFAULT_SUMMARY }
    let review = DEFAULT_REVIEW
    let calls = 0

    await page.route('https://api.openai.com/**', async (route) => {
      calls += 1
      // The app requests JSON (`response_format: json_object`) for summaries and
      // plain text for reviews — branch so each caller gets a parseable shape.
      const body = route.request().postDataJSON() as
        | { response_format?: { type?: string } }
        | null
      const wantsJson = body?.response_format?.type === 'json_object'
      const content = wantsJson ? JSON.stringify(summary) : review
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'chatcmpl-e2e',
          object: 'chat.completion',
          model: 'gpt-4o-mini',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      })
    })

    await use({
      setReview: (text: string) => {
        review = text
      },
      setSummary: (next: Partial<SummaryPayload>) => {
        summary = { ...summary, ...next }
      },
      callCount: () => calls,
    })
  },
})

export const expect = test.expect
