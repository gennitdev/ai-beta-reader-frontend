// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FontSizeControl from '@/components/reading/FontSizeControl.vue'

describe('FontSizeControl', () => {
  it('offers text size and accessible font choices', async () => {
    const wrapper = mount(FontSizeControl, {
      props: { modelValue: 'medium', fontFamily: 'system' },
    })

    const select = wrapper.get('select')
    expect(wrapper.text()).toContain('Text size')
    expect(wrapper.text()).toContain('Text font')
    expect(select.text()).toContain('Atkinson Hyperlegible')
    expect(select.text()).toContain('Georgia Serif')
    expect(select.text()).toContain('OpenDyslexic')

    await select.setValue('opendyslexic')
    expect(wrapper.emitted('update:fontFamily')).toEqual([['opendyslexic']])
  })
})
