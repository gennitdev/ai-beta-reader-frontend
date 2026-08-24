// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import IllustrationGrid from '@/components/images/IllustrationGrid.vue'
import type { ImageAsset } from '@/lib/database'

function image(id: string, assetType: ImageAsset['asset_type']): ImageAsset {
  return {
    id,
    book_id: 'book-1',
    chapter_id: assetType === 'chapter' ? 'chapter-1' : null,
    asset_type: assetType,
    file_name: `${id}.png`,
    file_path: `images/${id}.png`,
    mime_type: 'image/png',
    image_data: null,
    notes: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

describe('IllustrationGrid deletion controls', () => {
  it('shows delete only for images accepted by the ownership predicate', async () => {
    const chapterImage = image('chapter-image', 'chapter')
    const wikiImage = image('wiki-image', 'wiki')
    const wrapper = mount(IllustrationGrid, {
      props: {
        images: [chapterImage, wikiImage],
        imageSources: {
          'chapter-image': 'blob:chapter',
          'wiki-image': 'blob:wiki',
        },
        canDelete: true,
        canDeleteImage: (candidate) => candidate.asset_type === 'wiki',
      },
    })

    const deleteButtons = wrapper.findAll('button[title="Delete"]')
    expect(deleteButtons).toHaveLength(1)

    await deleteButtons[0].trigger('click')
    expect(wrapper.emitted('delete')).toEqual([['wiki-image']])
  })

  it('keeps the existing all-or-nothing delete behavior without a predicate', () => {
    const wrapper = mount(IllustrationGrid, {
      props: {
        images: [image('one', 'chapter'), image('two', 'wiki')],
        imageSources: {},
        canDelete: true,
      },
    })

    expect(wrapper.findAll('button[title="Delete"]')).toHaveLength(2)
  })

  it('hides delete controls when deletion is globally disabled', () => {
    const wrapper = mount(IllustrationGrid, {
      props: {
        images: [image('wiki-image', 'wiki')],
        imageSources: {},
        canDelete: false,
        canDeleteImage: () => true,
      },
    })

    expect(wrapper.find('button[title="Delete"]').exists()).toBe(false)
  })
})
