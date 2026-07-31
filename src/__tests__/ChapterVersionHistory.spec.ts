// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ChapterVersionHistory from '@/components/chapter/ChapterVersionHistory.vue'
import type { ChapterRevision } from '@/lib/database'

const revisions: ChapterRevision[] = [
  {
    id: 'revision-2',
    chapter_id: 'chapter-1',
    book_id: 'book-1',
    title: 'Moonrise',
    text: 'The moon was bright.',
    word_count: 4,
    words_added: 1,
    words_removed: 1,
    revision_kind: 'save',
    created_at: '2026-07-31T12:00:00.000Z',
  },
  {
    id: 'revision-1',
    chapter_id: 'chapter-1',
    book_id: 'book-1',
    title: 'Moonrise',
    text: 'The moon was pale.',
    word_count: 4,
    words_added: 0,
    words_removed: 0,
    revision_kind: 'baseline',
    created_at: '2026-07-30T12:00:00.000Z',
  },
]

describe('ChapterVersionHistory', () => {
  it('links each version to its dedicated revision page', async () => {
    const wrapper = mount(ChapterVersionHistory, {
      props: { bookId: 'book-1', chapterId: 'chapter-1', revisions },
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    })

    await wrapper.get('button').trigger('click')

    const links = wrapper.findAll('a')
    expect(links.map((link) => link.attributes('href'))).toEqual([
      '/books/book-1/chapters/chapter-1/versions/revision-2',
      '/books/book-1/chapters/chapter-1/versions/revision-1',
    ])
    expect(wrapper.text()).not.toContain('The moon was bright.')
  })
})
