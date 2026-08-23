// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import BookDeleteModal from '@/components/book/BookDeleteModal.vue'

const wrappers: VueWrapper[] = []
const preview = {
  bookId: 'book-1',
  title: 'A Dangerous Book',
  chapterCount: 12,
  partCount: 3,
  wikiPageCount: 8,
  imageCount: 5,
}

function mountModal(overrides: Record<string, unknown> = {}) {
  const wrapper = mount(BookDeleteModal, {
    props: { show: true, preview, deleting: false, error: null, ...overrides },
    global: { stubs: { Teleport: true } },
  })
  wrappers.push(wrapper)
  return wrapper
}

afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('BookDeleteModal', () => {
  it('shows deletion impact and requires the exact title', async () => {
    const wrapper = mountModal()
    const confirm = wrapper.get('button.bg-red-600')

    expect(wrapper.text()).toContain('12 chapters')
    expect(wrapper.text()).toContain('3 parts')
    expect(wrapper.text()).toContain('8 wiki pages')
    expect(wrapper.text()).toContain('5 images')
    expect(confirm.attributes('disabled')).toBeDefined()

    await wrapper.get('input').setValue('a dangerous book')
    expect(confirm.attributes('disabled')).toBeDefined()
    await wrapper.get('input').setValue('A Dangerous Book')
    const enabledConfirm = wrapper.get('button.bg-red-600')
    expect(enabledConfirm.attributes('disabled')).toBeUndefined()
    await enabledConfirm.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('reports errors and prevents cancellation while deletion is running', async () => {
    const wrapper = mountModal({ deleting: true, error: 'The database could not be saved.' })
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be saved')
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })
})
