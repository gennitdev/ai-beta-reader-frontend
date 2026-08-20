// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ChapterStatusBar from '@/components/chapter/ChapterStatusBar.vue'

const baseProps = {
  wordCount: 539,
  hasSummary: false,
  hasNotes: false,
}

describe('ChapterStatusBar', () => {
  it('renders chapter details as a sidebar panel', () => {
    const wrapper = mount(ChapterStatusBar, {
      props: { ...baseProps, variant: 'panel' },
    })

    expect(wrapper.text()).toContain('Chapter tools')
    expect(wrapper.text()).toContain('539 words')
    expect(wrapper.text()).toContain('Not summarized')
    expect(wrapper.text()).toContain('No Notes')

    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('keeps the compact inline layout as the default', () => {
    const wrapper = mount(ChapterStatusBar, { props: baseProps })

    expect(wrapper.text()).not.toContain('Chapter tools')
    expect(wrapper.classes()).toContain('flex')
    expect(wrapper.text()).toContain('No Notes')
  })
})
