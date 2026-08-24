// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ImageLightbox from '@/components/images/ImageLightbox.vue'
import type { ImageAsset } from '@/lib/database'

const image: ImageAsset = {
  id: 'image-1',
  book_id: 'book-1',
  chapter_id: 'chapter-1',
  asset_type: 'chapter',
  file_name: 'forest.png',
  file_path: 'images/forest.png',
  mime_type: 'image/png',
  image_data: null,
  notes: '',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const mounted: VueWrapper[] = []

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

function element<T extends Element = HTMLElement>(selector: string): T {
  const match = document.body.querySelector<T>(selector)
  if (!match) throw new Error(`Expected ${selector} to exist`)
  return match
}

async function mountLightbox(overrides: Record<string, unknown> = {}) {
  const wrapper = mount(ImageLightbox, {
    attachTo: document.body,
    props: {
      show: true,
      image,
      imageSrc: 'blob:forest',
      currentIndex: 2,
      totalImages: 3,
      hasPrevious: true,
      hasNext: true,
      ...overrides,
    },
    slots: {
      details: '<label>Notes<textarea data-testid="notes"></textarea></label>',
    },
  })
  mounted.push(wrapper)
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  return wrapper
}

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('ImageLightbox', () => {
  it('renders a contained, near-full-screen image with album position', async () => {
    await mountLightbox()

    expect(element('[data-testid="image-lightbox"]').classList).toContain('h-full')
    const preview = element<HTMLImageElement>('[data-testid="lightbox-image"]')
    expect(preview.src).toContain('blob:forest')
    expect(preview.alt).toBe('forest.png')
    expect(preview.classList).toContain('object-contain')
    expect(element('[data-testid="image-counter"]').textContent).toBe('2 of 3')
  })

  it('emits navigation from buttons and arrow keys', async () => {
    const wrapper = await mountLightbox()

    element<HTMLButtonElement>('button[aria-label="Previous image"]').click()
    element<HTMLButtonElement>('button[aria-label="Next image"]').click()
    element('[data-testid="image-lightbox"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    element('[data-testid="image-lightbox"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('previous')).toHaveLength(2)
    expect(wrapper.emitted('next')).toHaveLength(2)
  })

  it('does not change images while the user is typing in metadata', async () => {
    const wrapper = await mountLightbox()
    const notes = element<HTMLTextAreaElement>('[data-testid="notes"]')

    notes.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    notes.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('previous')).toBeUndefined()
    expect(wrapper.emitted('next')).toBeUndefined()
  })

  it('hides album navigation for one image and closes from the close button', async () => {
    const wrapper = await mountLightbox({ currentIndex: 1, totalImages: 1, hasPrevious: false, hasNext: false })

    expect(document.body.querySelector('[data-testid="image-counter"]')).toBeNull()
    expect(document.body.querySelector('button[aria-label="Previous image"]')).toBeNull()
    expect(document.body.querySelector('button[aria-label="Next image"]')).toBeNull()

    element<HTMLButtonElement>('button[aria-label="Close image viewer"]').click()
    await nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('disables navigation at album boundaries', async () => {
    await mountLightbox({ currentIndex: 1, hasPrevious: false, hasNext: true })

    expect(element<HTMLButtonElement>('button[aria-label="Previous image"]').disabled).toBe(true)
    expect(element<HTMLButtonElement>('button[aria-label="Next image"]').disabled).toBe(false)
  })
})
