// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LibraryBundleFieldDiff from '@/components/LibraryBundleFieldDiff.vue'

describe('LibraryBundleFieldDiff', () => {
  it('renders added and removed lines with long unchanged regions collapsed', () => {
    const sharedBefore = Array.from({ length: 8 }, (_, index) => `before ${index}`)
    const sharedAfter = Array.from({ length: 8 }, (_, index) => `after ${index}`)
    const wrapper = mount(LibraryBundleFieldDiff, { props: {
      field: 'body',
      localValue: [...sharedBefore, 'old sentence', ...sharedAfter].join('\n'),
      incomingValue: [...sharedBefore, 'new sentence', ...sharedAfter].join('\n'),
    } })

    expect(wrapper.get('[aria-label="Diff for body"]').text()).toContain('old sentence')
    expect(wrapper.text()).toContain('new sentence')
    expect(wrapper.text()).toContain('unchanged line(s) collapsed')
    expect(wrapper.text()).not.toContain('before 0')
    expect(wrapper.text()).not.toContain('after 7')
  })

  it('keeps short context visible and formats structured values', () => {
    const wrapper = mount(LibraryBundleFieldDiff, { props: {
      field: 'aliases',
      localValue: ['Alice', 'Al'],
      incomingValue: ['Alice', 'Ally'],
    } })

    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('Al')
    expect(wrapper.text()).toContain('Ally')
    expect(wrapper.text()).not.toContain('collapsed')
  })
})
