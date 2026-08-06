import { describe, expect, it } from 'vitest'
import { isMatchingRedirect } from '@/lib/googleOAuth'

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
    // startsWith() would have accepted these; the parsed path/host comparison does not.
    expect(isMatchingRedirect('https://www.beta-bot.net/oauth2redirect-evil?code=abc', httpsRedirect)).toBe(false)
    expect(isMatchingRedirect('https://www.beta-bot.net.evil.example/oauth2redirect', httpsRedirect)).toBe(false)
  })

  it('rejects a malformed URL', () => {
    expect(isMatchingRedirect('not a url', httpsRedirect)).toBe(false)
  })
})
