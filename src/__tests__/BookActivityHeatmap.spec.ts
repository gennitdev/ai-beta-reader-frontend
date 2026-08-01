// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BookActivityHeatmap from '@/components/book/BookActivityHeatmap.vue'
import type { ChapterRevisionActivity } from '@/lib/database'

const today = new Date().toISOString()

const activity: ChapterRevisionActivity[] = [
  {
    id: 'save-1',
    chapter_id: 'chapter-1',
    chapter_title: 'The Haunted Wood',
    activity_type: 'save',
    words_added: 120,
    words_removed: 8,
    word_count_deleted: 0,
    revision_available: true,
    created_at: today,
  },
  {
    id: 'save-discarded',
    chapter_id: 'chapter-3',
    chapter_title: 'A Vanished Draft',
    activity_type: 'save',
    words_added: 42,
    words_removed: 17,
    word_count_deleted: 0,
    revision_available: false,
    revision_discarded: true,
    created_at: today,
  },
  {
    id: 'delete-1',
    chapter_id: 'chapter-2',
    chapter_title: 'The Lost Road',
    activity_type: 'delete',
    words_added: 0,
    words_removed: 0,
    word_count_deleted: 940,
    revision_available: false,
    created_at: today,
  },
]

afterEach(() => {
  document.body.innerHTML = ''
})

describe('BookActivityHeatmap', () => {
  it('shows a tooltip affordance and lists the selected day activity', async () => {
    const wrapper = mount(BookActivityHeatmap, {
      props: { bookId: 'book-1', activity },
      attachTo: document.body,
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    })

    const activeCell = wrapper.get('button[aria-label*="Show activity"]')
    expect(activeCell.classes()).toContain('cursor-pointer')
    expect(activeCell.attributes('aria-label')).toContain('940 words')

    await activeCell.trigger('mouseenter')
    expect(document.body.textContent).toContain('1 chapter deleted (940 words)')

    await activeCell.trigger('click')
    expect(wrapper.text()).toContain('The Haunted Wood')
    expect(wrapper.text()).toContain('Saved revision')
    expect(wrapper.get('a[href="/books/book-1/chapters/chapter-1/versions/save-1"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('The Lost Road')
    expect(wrapper.text()).toContain('940 words deleted')
    expect(wrapper.text()).toContain('A Vanished Draft')
    expect(wrapper.text()).toContain('Revision discarded')
    expect(wrapper.find('a[href*="save-discarded"]').exists()).toBe(false)

    wrapper.unmount()
  })
})
