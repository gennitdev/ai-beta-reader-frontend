import axios from 'axios'
import { useAuth0 } from '@auth0/auth0-vue'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Add auth interceptor
apiClient.interceptors.request.use(async (config) => {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  if (isAuthenticated.value) {
    try {
      const token = await getAccessTokenSilently()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch (error) {
      console.warn('Failed to get access token:', error)
    }
  }

  return config
})

// API service functions
export const bookService = {
  async createBook(book: { id: string; title: string }) {
    const response = await apiClient.post('/books', book)
    return response.data
  },

  async getBookChapters(bookId: string) {
    const response = await apiClient.get(`/books/${bookId}/chapters`)
    return response.data
  }
}

export const chapterService = {
  async createChapter(chapter: { id: string; bookId: string; title?: string; text: string }) {
    const response = await apiClient.post('/chapters', chapter)
    return response.data
  },

  async getChapter(chapterId: string) {
    const response = await apiClient.get(`/chapters/${chapterId}`)
    return response.data
  },

  async generateSummary(chapterId: string) {
    const response = await apiClient.post(`/chapters/${chapterId}/summary`)
    return response.data
  },

  async updateChapter(chapter: { id: string; bookId: string; title?: string; text: string }) {
    const response = await apiClient.post('/chapters', chapter)
    return response.data
  }
}

export const reviewService = {
  async generateReview(data: { bookId: string; newChapterId: string; tone?: 'fanficnet' | 'editorial' | 'line-notes' }) {
    const response = await apiClient.post('/reviews', data)
    return response.data
  }
}