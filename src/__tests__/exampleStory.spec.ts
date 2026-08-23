// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readExampleStory } from '@/demo/exampleStory'

describe('example story fixture', () => {
  it('loads the complete canonical story without a database', async () => {
    const path = fileURLToPath(new URL('../demo/stories/jack-and-the-house-above-the-rain.zip', import.meta.url))
    const story = await readExampleStory(new Uint8Array(await readFile(path)))

    expect(story.model.books).toHaveLength(1)
    expect(story.model.books[0]).toMatchObject({
      id: 'jack-house-above-rain',
      title: 'Jack and the House Above the Rain',
    })
    expect(story.model.parts).toHaveLength(3)
    expect(story.model.chapters).toHaveLength(7)
    expect(story.model.chapter_summaries).toHaveLength(7)
    expect(story.model.part_summaries).toHaveLength(3)
    expect(story.model.wiki_pages).toHaveLength(15)
    expect(story.model.assets).toHaveLength(18)
  })
})
