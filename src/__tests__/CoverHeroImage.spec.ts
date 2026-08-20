// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CoverHeroImage from '@/components/images/CoverHeroImage.vue'

describe('CoverHeroImage', () => {
  it('shows the full cover over a darkened, blurred fill', async () => {
    const wrapper = mount(CoverHeroImage, {
      props: {
        src: '/cover.jpg',
        alt: 'Story cover',
        testIdPrefix: 'story',
      },
      slots: {
        default: '<div data-testid="overlay">Cover details</div>',
      },
    })

    const backdrop = wrapper.get('[data-testid="story-hero-backdrop"]')
    const image = wrapper.get('[data-testid="story-hero-image"]')

    expect(wrapper.findAll('img')).toHaveLength(2)
    expect(backdrop.attributes('src')).toBe('/cover.jpg')
    expect(backdrop.attributes('aria-hidden')).toBe('true')
    expect(backdrop.classes()).toEqual(expect.arrayContaining(['object-cover', 'blur-2xl']))
    expect(image.attributes()).toMatchObject({ src: '/cover.jpg', alt: 'Story cover' })
    expect(image.classes()).toContain('object-contain')
    expect(wrapper.get('[data-testid="overlay"]').text()).toBe('Cover details')

    await wrapper.trigger('click')
    expect(wrapper.emitted('activate')).toHaveLength(1)
  })
})
