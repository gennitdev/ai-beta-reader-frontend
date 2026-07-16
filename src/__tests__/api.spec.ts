import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAuthenticatedApiClient,
  createAuthService,
  createBookService,
  createChapterService,
  createReviewService,
  createWikiService,
  createAIProfileService,
  createSearchService,
} from '@/services/api'

const { mockClient, createMock } = vi.hoisted(() => {
  const mockClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: { request: { use: vi.fn() } },
  }
  return { mockClient, createMock: vi.fn(() => mockClient) }
})

vi.mock('axios', () => ({ default: { create: createMock } }))

const getToken = vi.fn(async () => 'token-abc' as string | undefined)

beforeEach(() => {
  vi.clearAllMocks()
  for (const verb of ['get', 'post', 'put', 'delete'] as const) {
    mockClient[verb].mockResolvedValue({ data: 'RESULT' })
  }
  getToken.mockResolvedValue('token-abc')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

/** Grab the request interceptor registered by createAuthenticatedApiClient. */
function lastInterceptor() {
  const calls = mockClient.interceptors.request.use.mock.calls
  return calls[calls.length - 1][0] as (config: {
    headers: Record<string, string>
    url?: string
    method?: string
  }) => Promise<{ headers: Record<string, string> }>
}

describe('createAuthenticatedApiClient interceptor', () => {
  it('adds a Bearer token when one is available', async () => {
    createAuthenticatedApiClient(getToken)
    const config = await lastInterceptor()({ headers: {}, url: '/x', method: 'get' })
    expect(config.headers.Authorization).toBe('Bearer token-abc')
  })

  it('omits the Authorization header when no token is available', async () => {
    getToken.mockResolvedValue(undefined)
    createAuthenticatedApiClient(getToken)
    const config = await lastInterceptor()({ headers: {}, url: '/x', method: 'get' })
    expect(config.headers.Authorization).toBeUndefined()
  })

  it('swallows token-retrieval errors and still returns the config', async () => {
    getToken.mockRejectedValue(new Error('token unavailable'))
    createAuthenticatedApiClient(getToken)
    const config = await lastInterceptor()({ headers: {}, url: '/x', method: 'get' })
    expect(config.headers.Authorization).toBeUndefined()
  })
})

describe('createAuthService', () => {
  const svc = () => createAuthService(getToken)

  it('createProfile posts to /auth/profile and returns data', async () => {
    expect(await svc().createProfile()).toBe('RESULT')
    expect(mockClient.post).toHaveBeenCalledWith('/auth/profile')
  })

  it('getProfile gets /auth/me', async () => {
    await svc().getProfile()
    expect(mockClient.get).toHaveBeenCalledWith('/auth/me')
  })
})

describe('createBookService', () => {
  const svc = () => createBookService(getToken)

  it('getBooks gets /books', async () => {
    expect(await svc().getBooks()).toBe('RESULT')
    expect(mockClient.get).toHaveBeenCalledWith('/books')
  })

  it('createBook posts the book body', async () => {
    const book = { id: 'b1', title: 'T' }
    await svc().createBook(book)
    expect(mockClient.post).toHaveBeenCalledWith('/books', book)
  })

  it('getBookChapters/Characters/Parts build nested URLs', async () => {
    await svc().getBookChapters('b1')
    expect(mockClient.get).toHaveBeenCalledWith('/books/b1/chapters')
    await svc().getBookCharacters('b1')
    expect(mockClient.get).toHaveBeenCalledWith('/books/b1/characters')
    await svc().getBookParts('b1')
    expect(mockClient.get).toHaveBeenCalledWith('/books/b1/parts')
  })

  it('part create/update/delete hit the parts endpoints', async () => {
    await svc().createBookPart('b1', { name: 'P', position: 1 })
    expect(mockClient.post).toHaveBeenCalledWith('/books/b1/parts', { name: 'P', position: 1 })
    await svc().updateBookPart('b1', 'p1', { name: 'P2' })
    expect(mockClient.put).toHaveBeenCalledWith('/books/b1/parts/p1', { name: 'P2' })
    await svc().deleteBookPart('b1', 'p1')
    expect(mockClient.delete).toHaveBeenCalledWith('/books/b1/parts/p1')
  })

  it('reorderChapters puts the order payload', async () => {
    await svc().reorderChapters('b1', ['c1', 'c2'], { p1: ['c1'] })
    expect(mockClient.put).toHaveBeenCalledWith('/books/b1/chapters/reorder', {
      chapterOrder: ['c1', 'c2'],
      partUpdates: { p1: ['c1'] },
    })
  })
})

describe('createChapterService', () => {
  const svc = () => createChapterService(getToken)
  const chapter = { id: 'c1', bookId: 'b1', title: 'T', text: 'body' }

  it('createChapter and updateChapter both post /chapters', async () => {
    await svc().createChapter(chapter)
    expect(mockClient.post).toHaveBeenCalledWith('/chapters', chapter)
    await svc().updateChapter(chapter)
    expect(mockClient.post).toHaveBeenCalledWith('/chapters', chapter)
  })

  it('getChapter and reviews build chapter URLs', async () => {
    await svc().getChapter('c1')
    expect(mockClient.get).toHaveBeenCalledWith('/chapters/c1')
    await svc().getChapterReviews('c1')
    expect(mockClient.get).toHaveBeenCalledWith('/chapters/c1/reviews')
  })

  it('summary generate/update hit the summary endpoint', async () => {
    await svc().generateSummary('c1')
    expect(mockClient.post).toHaveBeenCalledWith('/chapters/c1/summary')
    await svc().updateSummary('c1', 'new summary')
    expect(mockClient.put).toHaveBeenCalledWith('/chapters/c1/summary', { summary: 'new summary' })
  })

  it('deleteChapterReview and reorderChapter', async () => {
    await svc().deleteChapterReview('r1')
    expect(mockClient.delete).toHaveBeenCalledWith('/reviews/r1')
    await svc().reorderChapter('c1', { partId: null, bookPosition: 2 })
    expect(mockClient.put).toHaveBeenCalledWith('/chapters/c1/reorder', {
      partId: null,
      bookPosition: 2,
    })
  })
})

describe('createReviewService', () => {
  it('generateReview posts /reviews with the payload', async () => {
    const data = { bookId: 'b1', newChapterId: 'c1', tone: 'editorial' as const }
    expect(await createReviewService(getToken).generateReview(data)).toBe('RESULT')
    expect(mockClient.post).toHaveBeenCalledWith('/reviews', data)
  })
})

describe('createWikiService', () => {
  const svc = () => createWikiService(getToken)

  it('reads wiki pages and history', async () => {
    await svc().getBookWiki('b1')
    expect(mockClient.get).toHaveBeenCalledWith('/books/b1/wiki')
    await svc().getWikiPage('w1')
    expect(mockClient.get).toHaveBeenCalledWith('/wiki/w1')
    await svc().getWikiPageHistory('w1')
    expect(mockClient.get).toHaveBeenCalledWith('/wiki/w1/history')
  })

  it('creates, updates, and deletes wiki pages', async () => {
    await svc().createWikiPage('b1', { page_name: 'Alice', page_type: 'character' })
    expect(mockClient.post).toHaveBeenCalledWith('/books/b1/wiki', {
      page_name: 'Alice',
      page_type: 'character',
    })
    await svc().updateWikiPage('w1', { content: 'updated' })
    expect(mockClient.put).toHaveBeenCalledWith('/wiki/w1', { content: 'updated' })
    await svc().deleteWikiPage('w1')
    expect(mockClient.delete).toHaveBeenCalledWith('/wiki/w1')
  })
})

describe('createAIProfileService', () => {
  it('getAIProfile builds the profile URL', async () => {
    expect(await createAIProfileService(getToken).getAIProfile('p1')).toBe('RESULT')
    expect(mockClient.get).toHaveBeenCalledWith('/ai-profiles/p1')
  })
})

describe('createSearchService', () => {
  const svc = () => createSearchService(getToken)

  it('searchBook passes the query as a param', async () => {
    await svc().searchBook('b1', 'dragons')
    expect(mockClient.get).toHaveBeenCalledWith('/books/b1/search', { params: { q: 'dragons' } })
  })

  it('replaceInChapter and replaceInWikiPage post search/replace payloads', async () => {
    await svc().replaceInChapter('c1', 'foo', 'bar')
    expect(mockClient.post).toHaveBeenCalledWith('/chapters/c1/replace', {
      searchTerm: 'foo',
      replaceTerm: 'bar',
    })
    await svc().replaceInWikiPage('w1', 'foo', 'bar')
    expect(mockClient.post).toHaveBeenCalledWith('/wiki/w1/replace', {
      searchTerm: 'foo',
      replaceTerm: 'bar',
    })
  })
})
