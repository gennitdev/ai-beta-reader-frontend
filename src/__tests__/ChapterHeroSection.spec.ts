// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ChapterHeroSection from '@/components/chapter/ChapterHeroSection.vue'

describe('ChapterHeroSection', () => {
  it('keeps the hero focused on the image and back navigation', async () => {
    const wrapper = mount(ChapterHeroSection, {
      props: { heroImageSrc: '/chapter-cover.jpg' },
    })

    expect(wrapper.findAll('img')).toHaveLength(2)
    expect(wrapper.get('[data-testid="chapter-hero-image"]').attributes('src')).toBe('/chapter-cover.jpg')
    expect(wrapper.get('[data-testid="chapter-hero-image"]').classes()).toContain('object-contain')
    expect(wrapper.get('[data-testid="chapter-hero-backdrop"]').classes()).toContain('object-cover')
    expect(wrapper.get('[data-testid="chapter-hero-backdrop"]').classes()).toContain('blur-2xl')
    expect(wrapper.get('[data-testid="chapter-hero-backdrop"]').attributes('aria-hidden')).toBe('true')
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
