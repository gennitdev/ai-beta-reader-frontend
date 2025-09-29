import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Function to create authenticated API client
export function createAuthenticatedApiClient(getToken: () => Promise<string | undefined>) {
  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json'
    }
  })

  client.interceptors.request.use(async (config) => {
    try {
      const token = await getToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
        console.log('Request with token:', {
          url: config.url,
          method: config.method,
          hasToken: !!token,
          tokenPreview: token.substring(0, 20) + '...'
        })
      } else {
        console.warn('No token available for request:', config.url)
      }
    } catch (error) {
      console.warn('Failed to get access token:', error)
    }
    return config
  })

  return client
}

// Auth service functions
export function createAuthService(getToken: () => Promise<string | undefined>) {
  const client = createAuthenticatedApiClient(getToken)

  return {
    async createProfile() {
      const response = await client.post('/auth/profile')
      return response.data
    },

    async getProfile() {
      const response = await client.get('/auth/me')
      return response.data
    }
  }
}

// API service functions that create services with authentication
export function createBookService(getToken: () => Promise<string | undefined>) {
  const client = createAuthenticatedApiClient(getToken)

  return {
    async getBooks() {
      const response = await client.get('/books')
      return response.data
    },

    async createBook(book: { id: string; title: string }) {
      const response = await client.post('/books', book)
      return response.data
    },

    async getBookChapters(bookId: string) {
      const response = await client.get(`/books/${bookId}/chapters`)
      return response.data
    },

    async getBookCharacters(bookId: string) {
      const response = await client.get(`/books/${bookId}/characters`)
      return response.data
    },

    async getBookParts(bookId: string) {
      const response = await client.get(`/books/${bookId}/parts`)
      return response.data
    },

    async createBookPart(bookId: string, part: { name: string; position?: number }) {
      const response = await client.post(`/books/${bookId}/parts`, part)
      return response.data
    },

    async updateBookPart(bookId: string, partId: string, updates: { name?: string; position?: number }) {
      const response = await client.put(`/books/${bookId}/parts/${partId}`, updates)
      return response.data
    },

    async deleteBookPart(bookId: string, partId: string) {
      const response = await client.delete(`/books/${bookId}/parts/${partId}`)
      return response.data
    },

    async reorderChapters(bookId: string, chapters: { id: string; position: number; partId?: string | null }[]) {
      const response = await client.put(`/books/${bookId}/chapters/reorder`, { chapters })
      return response.data
    }
  }
}

export function createChapterService(getToken: () => Promise<string | undefined>) {
  const client = createAuthenticatedApiClient(getToken)

  return {
    async createChapter(chapter: { id: string; bookId: string; title?: string; text: string }) {
      const response = await client.post('/chapters', chapter)
      return response.data
    },

    async getChapter(chapterId: string) {
      const response = await client.get(`/chapters/${chapterId}`)
      return response.data
    },

    async generateSummary(chapterId: string) {
      const response = await client.post(`/chapters/${chapterId}/summary`)
      return response.data
    },

    async updateChapter(chapter: { id: string; bookId: string; title?: string; text: string }) {
      const response = await client.post('/chapters', chapter)
      return response.data
    },

    async getChapterReviews(chapterId: string) {
      const response = await client.get(`/chapters/${chapterId}/reviews`)
      return response.data
    },

    async deleteChapterReview(reviewId: string) {
      const response = await client.delete(`/reviews/${reviewId}`)
      return response.data
    },

    async reorderChapter(chapterId: string, data: { position?: number; partId?: string | null }) {
      const response = await client.put(`/chapters/${chapterId}/reorder`, data)
      return response.data
    }
  }
}

export function createReviewService(getToken: () => Promise<string | undefined>) {
  const client = createAuthenticatedApiClient(getToken)

  return {
    async generateReview(data: { bookId: string; newChapterId: string; tone?: 'fanficnet' | 'editorial' | 'line-notes'; customProfileId?: number }) {
      const response = await client.post('/reviews', data)
      return response.data
    }
  }
}

export function createWikiService(getToken: () => Promise<string | undefined>) {
  const client = createAuthenticatedApiClient(getToken)

  return {
    async getBookWiki(bookId: string) {
      const response = await client.get(`/books/${bookId}/wiki`)
      return response.data
    },

    async getWikiPage(wikiPageId: string) {
      const response = await client.get(`/wiki/${wikiPageId}`)
      return response.data
    },

    async createWikiPage(bookId: string, page: {
      page_name: string
      page_type?: 'character' | 'location' | 'concept' | 'other'
      content?: string
      summary?: string
      aliases?: string[]
      tags?: string[]
      is_major?: boolean
    }) {
      const response = await client.post(`/books/${bookId}/wiki`, page)
      return response.data
    },

    async updateWikiPage(wikiPageId: string, updates: {
      page_name?: string
      page_type?: 'character' | 'location' | 'concept' | 'other'
      content?: string
      summary?: string
      aliases?: string[]
      tags?: string[]
      is_major?: boolean
    }) {
      const response = await client.put(`/wiki/${wikiPageId}`, updates)
      return response.data
    },

    async deleteWikiPage(wikiPageId: string) {
      const response = await client.delete(`/wiki/${wikiPageId}`)
      return response.data
    },

    async getWikiPageHistory(wikiPageId: string) {
      const response = await client.get(`/wiki/${wikiPageId}/history`)
      return response.data
    }
  }
}

export const createAIProfileService = (getToken: () => Promise<string | undefined>) => {
  const client = createAuthenticatedApiClient(getToken)

  return {
    async getAIProfile(profileId: string) {
      const response = await client.get(`/ai-profiles/${profileId}`)
      return response.data
    }
  }
}