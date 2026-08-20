// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  copyChapterText: vi.fn(async () => ({
    success: true,
    verified: true,
    likelyTruncated: false,
  })),
}))

vi.mock('@/utils/clipboard', () => ({
  copyToClipboardWithResult: h.copyChapterText,
}))

vi.mock('@/utils/platform', () => ({
  isNativeMobileRuntime: () => false,
}))

import ChapterReadingActions from '@/components/chapter/ChapterReadingActions.vue'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  h.copyChapterText.mockClear()
})

describe('ChapterReadingActions', () => {
  it('copies the chapter with a descriptive action label', async () => {
    wrapper = mount(ChapterReadingActions, {
      props: { chapterText: 'The ghosts began to sing.' },
    })

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(h.copyChapterText).toHaveBeenCalledWith('The ghosts began to sing.')
    expect(wrapper.text()).toContain('Chapter text copied')
  })

  it('opens and exits fullscreen reading mode', async () => {
    wrapper = mount(ChapterReadingActions, {
      props: { chapterText: 'The ghosts began to sing.' },
    })

    await wrapper.findAll('button')[1].trigger('click')
    expect(document.body.textContent).toContain('Exit fullscreen')
    expect(document.body.style.overflow).toBe('hidden')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(document.body.textContent).not.toContain('Exit fullscreen')
    expect(document.body.style.overflow).toBe('')
  })
})
