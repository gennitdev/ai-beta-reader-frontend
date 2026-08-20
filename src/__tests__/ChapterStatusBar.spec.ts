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
  it('renders chapter details and all full-width chapter actions', () => {
    const wrapper = mount(ChapterStatusBar, {
      props: { ...baseProps, chapterText: 'A quiet chapter.' },
    })

    expect(wrapper.text()).toContain('Chapter tools')
    expect(wrapper.text()).toContain('539 words')
    expect(wrapper.text()).toContain('Not summarized')
    expect(wrapper.text()).toContain('No Notes')

    expect(wrapper.text()).toContain('Copy chapter text')
    expect(wrapper.text()).toContain('Fullscreen reading')
    expect(wrapper.text()).toContain('Edit Chapter')
    expect(wrapper.text()).toContain('Delete chapter')
    expect(wrapper.findAll('button').every((button) => button.classes().includes('w-full'))).toBe(true)
  })

  it('switches to editing actions and emits their events', async () => {
    const wrapper = mount(ChapterStatusBar, {
      props: { ...baseProps, isEditing: true, hasUnsavedChanges: true },
    })

    expect(wrapper.text()).not.toContain('Copy chapter text')
    expect(wrapper.text()).toContain('Save Chapter')
    expect(wrapper.text()).toContain('Cancel Editing')

    const buttons = wrapper.findAll('button')
    await buttons.find((button) => button.text() === 'Save Chapter')!.trigger('click')
    await buttons.find((button) => button.text() === 'Cancel Editing')!.trigger('click')
    await buttons.find((button) => button.text() === 'Delete chapter')!.trigger('click')

    expect(wrapper.emitted('save-chapter')).toHaveLength(1)
    expect(wrapper.emitted('cancel-edit')).toHaveLength(1)
    expect(wrapper.emitted('delete-chapter')).toHaveLength(1)
  })
})
