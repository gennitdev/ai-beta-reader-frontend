// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ChapterHeroSection from '@/components/chapter/ChapterHeroSection.vue'

describe('ChapterHeroSection', () => {
  it('keeps the hero focused on the image and back navigation', async () => {
    const wrapper = mount(ChapterHeroSection, {
      props: { heroImageSrc: '/chapter-cover.jpg' },
    })

    expect(wrapper.get('img').attributes('src')).toBe('/chapter-cover.jpg')
    expect(wrapper.text()).toBe('Back')

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('go-back')).toHaveLength(1)
  })

  it('can hide the hero back button for the mobile route', () => {
    const wrapper = mount(ChapterHeroSection, {
      props: { heroImageSrc: '/chapter-cover.jpg', showBack: false },
    })

    expect(wrapper.find('button').exists()).toBe(false)
  })
})
