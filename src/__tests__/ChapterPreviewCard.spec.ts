// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ChapterPreviewCard from '@/components/chapter/ChapterPreviewCard.vue'

describe('ChapterPreviewCard', () => {
  it('shows a shortened text preview before expanding the card', async () => {
    const content = Array.from({ length: 30 }, (_, index) => `word${index + 1}`).join(' ')
    const wrapper = mount(ChapterPreviewCard, {
      props: { title: 'Summary', content },
      slots: { default: '<div data-testid="full-content">Full summary details</div>' },
    })

    expect(wrapper.text()).toContain('word1')
    expect(wrapper.text()).toContain('word24…')
    expect(wrapper.text()).not.toContain('word25')
    expect(wrapper.find('[data-testid="full-content"]').exists()).toBe(false)

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('toggle-expanded')).toHaveLength(1)

    await wrapper.setProps({ expanded: true })
    expect(wrapper.get('[data-testid="full-content"]').text()).toBe('Full summary details')
    expect(wrapper.text()).toContain('Show less')
  })

  it('shows the full empty state when there is no preview content', () => {
    const wrapper = mount(ChapterPreviewCard, {
      props: { title: 'Notes', content: '' },
      slots: { default: '<div data-testid="empty-state">Add notes</div>' },
    })

    expect(wrapper.get('[data-testid="empty-state"]').text()).toBe('Add notes')
    expect(wrapper.text()).not.toContain('Show all')
  })
})
