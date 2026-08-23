// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BookDesktopMainPane from '@/components/book/BookDesktopMainPane.vue'

const part = {
  id: 'part-1',
  book_id: 'book-1',
  name: 'The Bargain',
  chapter_order: '["chapter-1"]',
  cover_image_id: 'cover-1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  chapters: [{
    id: 'chapter-1', title: 'The Cloud', word_count: 2950, has_summary: true,
    has_notes: false, summary: 'Chapter summary', position: 0,
    position_in_part: 0, part_id: 'part-1', part_name: 'The Bargain',
  }],
  wordCount: 2950,
}

function mountPane(partSummaries: Record<string, string> = {}) {
  return mount(BookDesktopMainPane, {
    props: {
      bookId: 'book-1',
      booksPath: '/books',
      currentTab: 'chapters',
      chaptersByPart: { parts: [part], uncategorized: [], uncategorizedWordCount: 0 },
      partSummaries,
      partThumbnails: { 'part-1': 'part-cover.webp' },
      formatWordCount: (count: number) => count.toLocaleString(),
      isOnBookOnly: true,
      routerViewKey: 0,
      wikiPagePinChanged: vi.fn(),
    },
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        RouterView: true,
        BookActivityHeatmap: true,
      },
    },
  })
}

describe('BookDesktopMainPane book overview', () => {
  it('centers the chapter-selection guidance and lists part summaries', () => {
    const wrapper = mountPane({ 'part-1': 'Jack accepts a dangerous bargain that changes the valley.' })

    expect(wrapper.get('[data-testid="chapter-selection-help"]').classes()).toContain('mx-auto')
    expect(wrapper.get('[data-testid="book-overview-part-summary-part-1"]').text()).toContain('dangerous bargain')
    expect(wrapper.get('[data-testid="book-overview-part-part-1"]').attributes('href')).toBe('/books/book-1/parts/part-1')
    expect(wrapper.text()).toContain('1 chapter · 2,950 words')
  })

  it('provides a useful fallback when a part has no summary yet', () => {
    const wrapper = mountPane()
    expect(wrapper.text()).toContain('Open this part to review its chapters and add a part summary.')
  })
})
