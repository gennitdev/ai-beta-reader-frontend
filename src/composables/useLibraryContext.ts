import { inject, provide, type InjectionKey } from 'vue'

export interface LibraryContext {
  readOnly: boolean
  readOnlyReason: string
  booksPath: string
}

const editableLibrary: LibraryContext = {
  readOnly: false,
  readOnlyReason: '',
  booksPath: '/books',
}

const libraryContextKey: InjectionKey<LibraryContext> = Symbol('library-context')

export function provideLibraryContext(context: LibraryContext): void {
  provide(libraryContextKey, context)
}

export function useLibraryContext(): LibraryContext {
  return inject(libraryContextKey, editableLibrary)
}

export function bookPath(bookId: string, suffix = '', context = useLibraryContext()): string {
  return `${context.booksPath}/${bookId}${suffix}`
}
