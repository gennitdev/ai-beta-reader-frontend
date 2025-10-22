import type { Book as DatabaseBook } from '@/lib/database'
import { useDatabase } from './useDatabase'

export interface Book extends DatabaseBook {
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
    const newBook: DatabaseBook = {
      ...book,
      chapter_order: '[]',
      part_order: '[]',
      created_at: new Date().toISOString()
    }
    await saveBook(newBook)
    return {
      ...newBook,
      chapterCount: 0
    }
  }

  return {
    books,
    loading,
    error,
    loadBooks,
    createBook
  }
}
