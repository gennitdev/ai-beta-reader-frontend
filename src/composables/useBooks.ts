import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useAuth0 } from '@auth0/auth0-vue'
import { createBookService } from '@/services/api'

interface Book {
  id: string
  title: string
  chapterCount?: number
}

export function useBooks() {
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()

  // Create authenticated book service
  const bookService = createBookService(async () => {
    try {
      return await getAccessTokenSilently()
    } catch (error) {
      console.warn('Failed to get access token:', error)
      return undefined
    }
  })

  // Mutation for creating books
  const createBookMutation = useMutation({
    mutationFn: async (book: { id: string; title: string }) => {
      const result = await bookService.createBook(book)
      return result
    },
    onSuccess: () => {
      // Invalidate and refetch any book-related queries
      queryClient.invalidateQueries({ queryKey: ['books'] })
    },
    onError: (error) => {
      console.error('Failed to create book:', error)
    }
  })

  return {
    createBook: createBookMutation
  }
}