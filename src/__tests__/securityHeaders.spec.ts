import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

interface VercelConfig {
  headers?: Array<{
    source: string
    headers: Array<{ key: string; value: string }>
  }>
}

describe('hosted browser security policy', () => {
  it('serves a restrictive CSP and baseline security headers', async () => {
    const config = JSON.parse(
      await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'),
    ) as VercelConfig
    const headers = new Map(config.headers?.[0]?.headers.map(({ key, value }) => [key, value]))
    const csp = headers.get('Content-Security-Policy') ?? ''

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('Permissions-Policy')).toContain('camera=()')
  })

  it('loads the theme bootstrap from an external script', async () => {
    const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')

    expect(html).toContain('<script src="/theme-init.js"></script>')
    expect(html).not.toContain('<script>')
  })
})
