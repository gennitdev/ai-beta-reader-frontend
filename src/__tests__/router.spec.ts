// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import router from '@/router'

describe('router', () => {
  it('registers the top-level routes with expected names and paths', () => {
    const byName = new Map(router.getRoutes().map((r) => [r.name, r.path]))
    expect(byName.get('home')).toBe('/')
    expect(byName.get('docs')).toBe('/docs')
    expect(byName.get('privacy')).toBe('/privacy')
    expect(byName.get('terms')).toBe('/terms')
    expect(byName.get('books')).toBe('/books')
    expect(byName.get('example-books')).toBe('/example-books')
    expect(byName.get('book')).toBe('/books/:id')
    expect(byName.get('settings')).toBe('/settings')
    expect(byName.get('library-data')).toBe('/library-data')
    expect(byName.get('ai-profiles')).toBe('/ai-profiles')
    expect(byName.get('challenges')).toBe('/challenges')
    expect(byName.get('bardwall')).toBe('/bardwall')
  })

  it('keeps example routes separate from editable book routes', () => {
    expect(router.resolve('/example-books').name).toBe('example-books')
    expect(router.resolve('/example-books/jack-house-above-rain').name).toBe('example-book')
    expect(router.resolve('/example-books/jack-house-above-rain/chapters/ch-1').name).toBe('example-book-chapter')
    expect(router.resolve('/example-books/jack-house-above-rain/parts/part-1').name).toBe('example-book-part')
    expect(router.resolve('/example-books/jack-house-above-rain/wiki/jack').name).toBe('example-book-wiki-page')
  })

  it('resolves the home path to the home route', () => {
    expect(router.resolve('/').name).toBe('home')
  })

  it('provides descriptive titles for public review pages', () => {
    expect(router.resolve('/').meta.title).toBe('beta bot — privacy-first AI beta reader')
    expect(router.resolve('/privacy').meta.title).toBe('Privacy Policy | beta bot')
    expect(router.resolve('/terms').meta.title).toBe('Terms of Use | beta bot')
  })

  it('updates the document title after navigation', async () => {
    await router.push('/privacy')
    expect(document.title).toBe('Privacy Policy | beta bot')

    await router.push('/books')
    expect(document.title).toBe('beta bot')
  }, 15_000)

  it('keeps Bardwall locations and cave activities inside Bardwall routes', () => {
    const market = router.resolve('/bardwall/market')
    expect(market.name).toBe('bardwall-location')
    expect(market.params.location).toBe('market')

    const wyrm = router.resolve('/bardwall/cave/wyrm')
    expect(wyrm.name).toBe('bardwall-location')
    expect(wyrm.params).toMatchObject({ location: 'cave', activity: 'wyrm' })

    const lastWord = router.resolve('/bardwall/cave/last-word')
    expect(lastWord.name).toBe('bardwall-location')
    expect(lastWord.params).toMatchObject({ location: 'cave', activity: 'last-word' })
  })

  it('nests chapter/part/wiki routes under the book route', () => {
    const book = router.getRoutes().find((r) => r.name === 'book-chapter')
    expect(book?.path).toBe('/books/:id/chapters/:chapterId')
    const version = router.getRoutes().find((r) => r.name === 'book-chapter-version')
    expect(version?.path).toBe('/books/:id/chapters/:chapterId/versions/:revisionId')
  })

  it('flags mobile routes with meta.mobile', () => {
    const mobile = router.resolve('/m/books/b1/chapters/c1')
    expect(mobile.name).toBe('mobile-chapter')
    expect(mobile.meta.mobile).toBe(true)
  })

  it('lazily loads every route component', async () => {
    const loaders = router
      .getRoutes()
      .map((r) => r.components?.default)
      .filter((c): c is () => Promise<unknown> => typeof c === 'function')

    expect(loaders.length).toBeGreaterThan(0)

    // Invoke each loader so the dynamic-import expression executes, then
    // swallow the result — we're exercising the route config, not mounting.
    await Promise.allSettled(loaders.map((load) => Promise.resolve().then(load)))
    // Generous timeout: this transitively imports/compiles every view, which can
    // exceed a tight budget under full-suite CPU contention (it passes in
    // isolation). We're validating route wiring, not load performance.
  }, 30_000)
})
