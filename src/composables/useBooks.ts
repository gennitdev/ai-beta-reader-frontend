import { useDatabase } from './useDatabase'

export interface Book {
  id: string
  title: string
  created_at: string
  chapterCount?: number
}

export function useBooks() {
  const {
    books,
    loading,
    error,
    loadBooks,
    saveBook
  } = useDatabase()

  async function createBook(book: { id: string; title: string }) {
    const newBook: Book = {
      ...book,
      created_at: new Date().toISOString()
    }
    await saveBook(newBook)
    return newBook
  }

  return {
    books,
    loading,
    error,
    loadBooks,
    createBook
  }
}