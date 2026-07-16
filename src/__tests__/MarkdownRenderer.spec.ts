// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

function render(props: Record<string, unknown>) {
  return mount(MarkdownRenderer, { props: props as { text: string } }).html()
}

describe('MarkdownRenderer', () => {
  it('renders basic markdown to HTML', () => {
    const html = render({ text: 'Hello **bold** world' })
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<p>')
  })

  it('maps the fontSize prop to a text size class', () => {
    expect(render({ text: 'x', fontSize: 'small' })).toContain('text-sm')
    expect(render({ text: 'x', fontSize: 'large' })).toContain('text-lg')
    expect(render({ text: 'x', fontSize: 'medium' })).toContain('text-base')
    expect(render({ text: 'x', fontSize: 'unknown' })).toContain('text-base')
  })

  it('adds anchor ids and links to headings', () => {
    const html = render({ text: '# My Heading!' })
    expect(html).toContain('id="my-heading"')
    expect(html).toContain('href="#my-heading"')
    expect(html).toContain('aria-label="Link to My Heading!"')
  })

  it('injects a max-height style into images', () => {
    const html = render({ text: '![alt](img.png)', imageMaxHeight: '200px' })
    expect(html).toContain('max-height: 200px')
    expect(html).toContain('rounded-lg')
  })

  it('highlights fenced code blocks with a known language', () => {
    const html = render({ text: '```js\nconst a = 1\n```' })
    expect(html).toContain('hljs')
  })

  it('applies the reading-layout class when enabled', () => {
    expect(render({ text: 'x', readingLayout: true })).toContain('markdown-body')
    expect(render({ text: 'x', readingLayout: false })).not.toContain('markdown-body')
  })

  it('converts character mentions into wiki links when enabled', () => {
    const html = render({
      text: 'Alice went home',
      enableWikiLinks: true,
      bookId: 'book-1',
      characters: [
        { id: 'c1', character_name: 'Alice', wiki_page_id: 'w1', has_wiki_page: true },
      ],
    })
    expect(html).toContain('/books/book-1/wiki/w1')
  })

  it('leaves text unlinked when wiki links are disabled', () => {
    const html = render({
      text: 'Alice went home',
      enableWikiLinks: false,
      bookId: 'book-1',
      characters: [
        { id: 'c1', character_name: 'Alice', wiki_page_id: 'w1', has_wiki_page: true },
      ],
    })
    expect(html).not.toContain('/books/book-1/wiki/w1')
  })
})
