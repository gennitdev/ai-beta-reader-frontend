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
    async createBook(book: { id: string; title: string }) {
      const response = await client.post('/books', book)
      return response.data
    },

    async getBookChapters(bookId: string) {
      const response = await client.get(`/books/${bookId}/chapters`)
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
    }
  }
}

export function createReviewService(getToken: () => Promise<string | undefined>) {
  const client = createAuthenticatedApiClient(getToken)

  return {
    async generateReview(data: { bookId: string; newChapterId: string; tone?: 'fanficnet' | 'editorial' | 'line-notes' }) {
      const response = await client.post('/reviews', data)
      return response.data
    }
  }
}