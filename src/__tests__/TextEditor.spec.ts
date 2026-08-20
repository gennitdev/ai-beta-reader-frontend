// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import TextEditor from '@/components/TextEditor.vue'

const SlotStub = { template: '<div><slot /></div>' }
const TabStub = { template: '<div><slot :selected="true" /></div>' }
const MarkdownStub = { props: ['text'], template: '<div data-testid="preview">{{ text }}</div>' }
const wrappers: VueWrapper[] = []

function mountEditor(props: Record<string, unknown> = {}) {
  const wrapper = mount(TextEditor, {
    props,
    global: {
      stubs: {
        TabGroup: SlotStub,
        TabList: SlotStub,
        Tab: TabStub,
        TabPanels: SlotStub,
        TabPanel: SlotStub,
        MarkdownRenderer: MarkdownStub,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

function toolbarButton(wrapper: VueWrapper, title: string) {
  return wrapper.get(`button[title="${title}"]`)
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
})

describe('TextEditor', () => {
  it('uses the initial value, focuses the editor, and emits input changes', async () => {
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus')
    const wrapper = mountEditor({ initialValue: 'Opening draft' })
    const textarea = wrapper.get('textarea')

    expect((textarea.element as HTMLTextAreaElement).value).toBe('Opening draft')
    expect(focus).toHaveBeenCalled()

    await textarea.setValue('Revised draft')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Revised draft'])
    expect(wrapper.emitted('change')?.at(-1)).toEqual(['Revised draft'])
  })

  it('tracks external model changes without emitting them back', async () => {
    const wrapper = mountEditor({ modelValue: 'Original' })

    await wrapper.setProps({ modelValue: 'Loaded elsewhere' })

    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('Loaded elsewhere')
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it.each([
    ['Bold', '**selected**'],
    ['Italic', '*selected*'],
    ['Code', '`selected`'],
    ['Quote', '> selected'],
  ])('formats selected text with %s', async (title, expected) => {
    const wrapper = mountEditor({ modelValue: 'before selected after' })
    const textarea = wrapper.get('textarea').element as HTMLTextAreaElement
    textarea.setSelectionRange(7, 15)

    await toolbarButton(wrapper, title).trigger('click')

    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(`before ${expected} after`)
    expect(wrapper.emitted('change')?.at(-1)).toEqual([`before ${expected} after`])
  })

  it('inserts placeholders and leaves the cursor inside empty inline formatting', async () => {
    const wrapper = mountEditor({ modelValue: 'Draft' })
    const textarea = wrapper.get('textarea').element as HTMLTextAreaElement
    textarea.setSelectionRange(5, 5)

    await toolbarButton(wrapper, 'Bold').trigger('click')
    await wrapper.vm.$nextTick()

    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('Draft****')
    expect(textarea.selectionStart).toBe(7)
  })

  it('inserts headings and both list styles at the active cursor', async () => {
    const headingWrapper = mountEditor({ modelValue: 'Chapter name' })
    const headingTextarea = headingWrapper.get('textarea').element as HTMLTextAreaElement
    headingTextarea.setSelectionRange(0, 7)
    await toolbarButton(headingWrapper, 'Heading 2').trigger('click')
    expect((headingWrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('## Chapter name')

    const bulletWrapper = mountEditor({ modelValue: 'End' })
    ;(bulletWrapper.get('textarea').element as HTMLTextAreaElement).setSelectionRange(0, 0)
    await toolbarButton(bulletWrapper, 'Bullet List').trigger('click')
    expect((bulletWrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('- List itemEnd')

    const numberedWrapper = mountEditor({ modelValue: 'End' })
    ;(numberedWrapper.get('textarea').element as HTMLTextAreaElement).setSelectionRange(0, 0)
    await toolbarButton(numberedWrapper, 'Numbered List').trigger('click')
    expect((numberedWrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('1. List itemEnd')
  })

  it('marks over-limit content, renders previews, and honors readonly mode', () => {
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus')
    const wrapper = mountEditor({ modelValue: 'Too long', maxLength: 3, readonly: true })

    expect(wrapper.get('textarea').classes()).toContain('border-red-500')
    expect(wrapper.get('textarea').attributes('readonly')).toBeDefined()
    expect(wrapper.get('[data-testid="preview"]').text()).toBe('Too long')
    expect(focus).not.toHaveBeenCalled()
  })

  it('shows an empty preview state for whitespace-only content', () => {
    const wrapper = mountEditor({ modelValue: '   ' })
    expect(wrapper.text()).toContain('Nothing to preview')
    expect(wrapper.find('[data-testid="preview"]').exists()).toBe(false)
  })
})
