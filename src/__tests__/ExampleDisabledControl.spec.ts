// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ExampleDisabledControl from '@/components/ExampleDisabledControl.vue'

describe('ExampleDisabledControl', () => {
  it('explains a disabled action on hover and keyboard focus', async () => {
    const wrapper = mount(ExampleDisabledControl, {
      props: { explanation: 'Import this story to edit it.' },
      slots: { default: '<button disabled>Edit</button>' },
    })

    expect(wrapper.attributes('tabindex')).toBe('0')
    expect(wrapper.attributes('aria-label')).toBe('Import this story to edit it.')
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)

    await wrapper.trigger('focus')
    expect(wrapper.get('[role="tooltip"]').text()).toBe('Import this story to edit it.')
    expect(wrapper.get('button').attributes()).toHaveProperty('disabled')

    await wrapper.trigger('blur')
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
    await wrapper.trigger('mouseenter')
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(true)
  })
})
