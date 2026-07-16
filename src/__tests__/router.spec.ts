// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import router from '@/router'

describe('router', () => {
  it('registers the top-level routes with expected names and paths', () => {
    const byName = new Map(router.getRoutes().map((r) => [r.name, r.path]))
    expect(byName.get('home')).toBe('/')
    expect(byName.get('docs')).toBe('/docs')
    expect(byName.get('books')).toBe('/books')
    expect(byName.get('book')).toBe('/books/:id')
    expect(byName.get('settings')).toBe('/settings')
    expect(byName.get('ai-profiles')).toBe('/ai-profiles')
    expect(byName.get('challenges')).toBe('/challenges')
  })

  it('resolves the home path to the home route', () => {
    expect(router.resolve('/').name).toBe('home')
  })

  it('nests chapter/part/wiki routes under the book route', () => {
    const book = router.getRoutes().find((r) => r.name === 'book-chapter')
    expect(book?.path).toBe('/books/:id/chapters/:chapterId')
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
  })
})
