// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PersistenceErrorNotice from '@/components/PersistenceErrorNotice.vue'

describe('PersistenceErrorNotice', () => {
  it('shows a durable-write failure and emits a retry request', async () => {
    const wrapper = mount(PersistenceErrorNotice, {
      props: {
        message: 'Changes could not be saved.',
        retrying: false,
      },
    })

    expect(wrapper.get('[role="alert"]').text()).toContain('Changes could not be saved.')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('disables repeated retries while a write is in progress', () => {
    const wrapper = mount(PersistenceErrorNotice, {
      props: {
        message: 'Changes could not be saved.',
        retrying: true,
      },
    })

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button').text()).toBe('Retrying…')
  })
})
