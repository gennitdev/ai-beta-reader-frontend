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

function mountPane(
  partSummaries: Record<string, string> = {},
  requestDeleteBook = vi.fn(),
  overrides: Record<string, unknown> = {},
) {
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
      requestDeleteBook,
      ...overrides,
    },
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        RouterView: true,
        BookActivityHeatmap: true,
        IllustrationGrid: {
          props: ['images'],
          emits: ['open-image'],
          template: '<div data-testid="image-grid"><button v-for="image in images" :key="image.id" @click="$emit(\'open-image\', image.id)">{{ image.file_name }}</button></div>',
        },
        ImageLightbox: {
          props: ['show', 'image'],
          template: '<div v-if="show" data-testid="image-lightbox"><slot name="details" />{{ image?.file_name }}</div>',
        },
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

  it('places settings and delete actions in the normal flow at the bottom of the overview', async () => {
    const requestDeleteBook = vi.fn()
    const wrapper = mountPane({}, requestDeleteBook)
    const actions = wrapper.get('[data-testid="book-overview-actions"]')

    expect(actions.classes()).not.toContain('fixed')
    expect(actions.get('a').attributes('href')).toBe('/settings')

    await actions.get('button').trigger('click')
    expect(requestDeleteBook).toHaveBeenCalledOnce()
  })

  it('shows wiki guidance and wiki cards instead of the chapter overview', () => {
    const wrapper = mountPane({}, vi.fn(), {
      currentTab: 'wiki',
      wikiPagesByType: {
        character: [{
          id: 'wiki-1', page_name: 'Mara', page_type: 'character', summary: 'A reluctant guide.',
          aliases: [], tags: [], is_major: true, is_pinned: false, created_by_ai: false,
          created_at: '2026-01-01', updated_at: '2026-01-01', content_length: 120,
          cover_image_id: null,
        }],
      },
      getTypeIcon: () => 'span',
      getTypeColor: () => 'text-blue-500',
    })

    expect(wrapper.text()).toContain('Please select a wiki page')
    expect(wrapper.text()).not.toContain('Please select a chapter')
    expect(wrapper.find('[data-testid="book-overview-part-part-1"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="book-overview-wiki-wiki-1"]').attributes('href')).toBe('/books/book-1/wiki/wiki-1')
  })

  it('renders images in the main pane and opens the shared image viewer selection', async () => {
    const selectBookImage = vi.fn()
    const image = {
      id: 'image-1', book_id: 'book-1', chapter_id: null, asset_type: 'chapter',
      file_name: 'Mara.png', file_path: '/Mara.png', mime_type: 'image/png', image_data: null,
      notes: '', created_at: '2026-01-01', updated_at: '2026-01-01',
    }
    const wrapper = mountPane({}, vi.fn(), {
      currentTab: 'images',
      bookImages: [image],
      bookImageSources: { 'image-1': 'blob:image-1' },
      selectedImageId: 'image-1',
      selectedImageSrc: 'blob:image-1',
      selectedImage: image,
      selectBookImage,
    })

    expect(wrapper.get('[data-testid="book-images-overview"]').exists()).toBe(true)
    await wrapper.get('[data-testid="image-grid"] button').trigger('click')
    expect(selectBookImage).toHaveBeenCalledWith('image-1')
    expect(wrapper.get('[data-testid="image-lightbox"]').text()).toContain('Mara.png')
  })
})
