import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOpenAIClient,
  getProfileByToneKey,
  generateReview,
  generateChapterSummary,
  generatePartSummary,
  generateWikiContent,
  updateWikiPagesFromChapter,
  BUILT_IN_PROFILES,
  type AIProfile,
} from '@/lib/openai'

const create = vi.hoisted(() => vi.fn())

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } }
    constructor(public opts: unknown) {}
  },
}))

beforeEach(() => {
  create.mockReset()
})

describe('createOpenAIClient', () => {
  it('throws when no API key is provided', () => {
    expect(() => createOpenAIClient('')).toThrow(/API key is required/)
  })

  it('constructs a client with the key and browser flag', () => {
    const client = createOpenAIClient('sk-test') as unknown as { opts: Record<string, unknown> }
    expect(client.opts).toMatchObject({ apiKey: 'sk-test', dangerouslyAllowBrowser: true })
  })
})

describe('getProfileByToneKey', () => {
  const custom: AIProfile = {
    id: 'c1',
    name: 'My Reviewer',
    tone_key: 'my-tone',
    system_prompt: 'custom prompt',
    is_system: false,
  }

  it('prefers a matching custom profile', () => {
    expect(getProfileByToneKey('my-tone', [custom])).toBe(custom)
  })

  it('falls back to a built-in profile', () => {
    expect(getProfileByToneKey('editorial')).toBe(BUILT_IN_PROFILES.editorial)
  })

  it('returns null for an unknown tone key', () => {
    expect(getProfileByToneKey('does-not-exist')).toBeNull()
  })
})

describe('BUILT_IN_PROFILES', () => {
  it('exposes the expected system profiles', () => {
    expect(Object.keys(BUILT_IN_PROFILES)).toEqual(['fanficnet', 'editorial', 'line-notes'])
    for (const key of Object.keys(BUILT_IN_PROFILES)) {
      const profile = BUILT_IN_PROFILES[key as keyof typeof BUILT_IN_PROFILES]
      expect(profile.tone_key).toBe(key)
      expect(profile.is_system).toBe(true)
      expect(profile.system_prompt.length).toBeGreaterThan(0)
    }
  })
})

const profile: AIProfile = {
  id: 'p1',
  name: 'Editor',
  tone_key: 'editorial',
  system_prompt: 'You are a developmental editor.',
  is_system: true,
}

describe('generateReview', () => {
  it('builds the prompt, calls the model, and returns the review + prompt', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'The review.' } }] })

    const result = await generateReview('sk', 'chapter body', 'The Title', 'ch-1', profile, {})

    expect(result.reviewText).toBe('The review.')
    expect(result.promptUsed).toContain('You are a developmental editor.')
    expect(result.promptUsed).toContain('No prior story context.')
    expect(result.promptUsed).toContain('NEW CHAPTER: ch-1 — The Title')

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          { role: 'system', content: profile.system_prompt },
          { role: 'user', content: expect.stringContaining('chapter body') },
        ],
      }),
    )
  })

  it('includes prior part and current part context sections when provided', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] })

    const result = await generateReview('sk', 'body', 'Title', 'ch-2', profile, {
      priorPartSummaries: [
        { partId: 'pt-1', partNumber: 1, partTitle: 'Beginnings', summary: 'Part one recap.' },
      ],
      currentPartChapterSummaries: [{ id: 'ch-1', title: 'Opening', summary: 'Chapter one recap.' }],
    })

    expect(result.promptUsed).toContain('PREVIOUS PART SUMMARIES:')
    expect(result.promptUsed).toContain('Part 1 — Beginnings')
    expect(result.promptUsed).toContain('CURRENT PART CONTEXT:')
    expect(result.promptUsed).toContain('Chapter one recap.')
  })

  it('returns an empty review when the model returns no content', async () => {
    create.mockResolvedValue({ choices: [{ message: {} }] })
    const result = await generateReview('sk', 'body', 'Title', 'ch-3', profile, {})
    expect(result.reviewText).toBe('')
  })
})

describe('generateChapterSummary', () => {
  it('parses the JSON response and normalizes fields', async () => {
    create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'A summary.',
              pov: 'Alice',
              characters: ['Alice', 'Bob'],
              locations: ['The Keep'],
              beats: ['Beat one'],
              spoilers_ok: true,
            }),
          },
        },
      ],
    })

    const result = await generateChapterSummary('sk', 'text', 'Title', 'ch-1', 'b1', 'Book', true)

    expect(result).toEqual({
      summary: 'A summary.',
      pov: 'Alice',
      characters: ['Alice', 'Bob'],
      locations: ['The Keep'],
      beats: ['Beat one'],
      spoilers_ok: true,
    })
    // First-chapter branch flows into the system prompt.
    const call = create.mock.calls[0][0]
    expect(call.messages[0].content).toContain('FIRST chapter')
    expect(call.response_format).toEqual({ type: 'json_object' })
  })

  it('defaults missing JSON fields and includes prior-part context', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: '{}' } }] })
    const result = await generateChapterSummary('sk', 'text', '', 'ch-2', 'b1', 'Book', false, {
      priorPartSummaries: [
        { partId: 'pt-1', partNumber: 1, partTitle: 'Beginnings', summary: 'Part one.' },
      ],
      priorChapterSummaries: [{ id: 'ch-1', title: 'One', summary: 'Recap.' }],
      partName: 'Part A',
      partNumber: 1,
    })
    const userPrompt = create.mock.calls[0][0].messages[1].content
    expect(userPrompt).toContain('PREVIOUS PART OVERVIEWS:')
    expect(userPrompt).toContain('EARLIER CHAPTERS IN THIS PART:')
    expect(userPrompt).toContain('Part: Part A (Part 1)')
    expect(result).toEqual({
      summary: '',
      pov: null,
      characters: [],
      locations: [],
      beats: [],
      spoilers_ok: false,
    })
  })

  it('throws when the model returns no content', async () => {
    create.mockResolvedValue({ choices: [{ message: {} }] })
    await expect(
      generateChapterSummary('sk', 'text', 'Title', 'ch-3', 'b1', 'Book'),
    ).rejects.toThrow(/No response from OpenAI/)
  })
})

describe('generatePartSummary', () => {
  const chapters = [
    { id: 'ch-1', title: 'One', summary: 'First.' },
    { id: 'ch-2', title: 'Two', summary: 'Second.' },
  ]

  it('summarizes a part from its chapter summaries', async () => {
    create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'Part summary.',
              characters: ['Alice'],
              beats: ['Beat'],
            }),
          },
        },
      ],
    })

    const result = await generatePartSummary('sk', 'Book', 'Part One', 'pt-1', chapters, 1)

    expect(result).toEqual({ summary: 'Part summary.', characters: ['Alice'], beats: ['Beat'] })
    const userPrompt = create.mock.calls[0][0].messages[1].content
    expect(userPrompt).toContain('Part 1 contains the following chapter summaries')
    expect(userPrompt).toContain('### 1. One (ch-1)')
  })

  it('throws when given no chapters', async () => {
    await expect(generatePartSummary('sk', 'Book', 'Part One', 'pt-1', [])).rejects.toThrow(
      /At least one chapter summary is required/,
    )
  })

  it('throws when the model returns no content', async () => {
    create.mockResolvedValue({ choices: [{ message: {} }] })
    await expect(
      generatePartSummary('sk', 'Book', 'Part One', 'pt-1', chapters),
    ).rejects.toThrow(/No response from OpenAI/)
  })
})

describe('generateWikiContent', () => {
  it('builds a "create" prompt for a new page and returns parsed JSON', async () => {
    create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: '# Alice\n\nProfile.',
              summary: 'A hero.',
              hasChanges: true,
            }),
          },
        },
      ],
    })

    const result = await generateWikiContent('sk', 'Alice', 'chapter text', 'summary', null)

    expect(result).toMatchObject({ content: '# Alice\n\nProfile.', hasChanges: true })
    const [system, user] = create.mock.calls[0][0].messages
    expect(system.content).toContain('creating a character page')
    expect(user.content).toContain('Create a wiki page for character: Alice')
  })

  it('builds an "update" prompt when existing content is provided', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ content: 'x', summary: 'y', hasChanges: false }) } }],
    })

    await generateWikiContent('sk', 'The Keep', 'text', 'summary', '# The Keep\n\nOld.', 'location')

    const [system, user] = create.mock.calls[0][0].messages
    expect(system.content).toContain('updating a location/setting page')
    expect(user.content).toContain('EXISTING WIKI CONTENT:')
    expect(user.content).toContain('# The Keep\n\nOld.')
  })

  it('returns a basic fallback when generation fails', async () => {
    create.mockRejectedValue(new Error('rate limited'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await generateWikiContent('sk', 'Alice', 'text', 'A recap.', null)

    expect(result.content).toContain('# Alice')
    expect(result.summary).toBe('Character from the story')
    expect(result.hasChanges).toBe(true)
  })

  it('falls back to a basic page when the model returns no content', async () => {
    create.mockResolvedValue({ choices: [{ message: {} }] })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await generateWikiContent('sk', 'Zed', 'text', 'A recap.', null, 'concept')

    expect(result.content).toContain('# Zed')
    expect(result.summary).toBe('Concept from the story')
  })
})

describe('updateWikiPagesFromChapter', () => {
  function deps() {
    return {
      getWikiPageFn: vi.fn(),
      createWikiPageFn: vi.fn(async () => 'new-page-id'),
      updateWikiPageFn: vi.fn(async () => {}),
      trackWikiUpdateFn: vi.fn(async () => {}),
      addChapterWikiMentionFn: vi.fn(async () => {}),
    }
  }

  function run(d: ReturnType<typeof deps>, characters: string[]) {
    return updateWikiPagesFromChapter(
      'sk',
      'book-1',
      'ch-1',
      'chapter text',
      'chapter summary',
      characters,
      d.getWikiPageFn,
      d.createWikiPageFn,
      d.updateWikiPageFn,
      d.trackWikiUpdateFn,
      d.addChapterWikiMentionFn,
    )
  }

  it('creates a new page and tracks the creation for an unknown character', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ content: 'c', summary: 's', hasChanges: true }) } }],
    })
    const d = deps()
    d.getWikiPageFn.mockResolvedValue(null)

    await run(d, ['Alice'])

    expect(d.createWikiPageFn).toHaveBeenCalledWith(
      expect.objectContaining({ page_name: 'Alice', page_type: 'character', created_by_ai: true }),
    )
    expect(d.trackWikiUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({ wiki_page_id: 'new-page-id', update_type: 'created' }),
    )
    expect(d.addChapterWikiMentionFn).toHaveBeenCalledWith('ch-1', 'new-page-id')
    expect(d.updateWikiPageFn).not.toHaveBeenCalled()
  })

  it('updates an existing page when there are changes', async () => {
    create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: 'updated',
              summary: 's2',
              hasChanges: true,
              hasContradictions: true,
              contradictions: 'eye color changed',
              changeSummary: 'added detail',
            }),
          },
        },
      ],
    })
    const d = deps()
    d.getWikiPageFn.mockResolvedValue({ id: 'existing-1', content: 'old' })

    await run(d, ['Bob'])

    expect(d.updateWikiPageFn).toHaveBeenCalledWith('existing-1', {
      content: 'updated',
      summary: 's2',
    })
    expect(d.trackWikiUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({ update_type: 'update_with_contradictions' }),
    )
    expect(d.addChapterWikiMentionFn).toHaveBeenCalledWith('ch-1', 'existing-1')
    expect(d.createWikiPageFn).not.toHaveBeenCalled()
  })

  it('skips the update when an existing page has no changes but still records the mention', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ content: 'x', summary: 'y', hasChanges: false }) } }],
    })
    const d = deps()
    d.getWikiPageFn.mockResolvedValue({ id: 'existing-2', content: 'old' })

    await run(d, ['Carol'])

    expect(d.updateWikiPageFn).not.toHaveBeenCalled()
    expect(d.trackWikiUpdateFn).not.toHaveBeenCalled()
    expect(d.addChapterWikiMentionFn).toHaveBeenCalledWith('ch-1', 'existing-2')
  })

  it('continues with other characters when one fails', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ content: 'c', summary: 's', hasChanges: true }) } }],
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps()
    d.getWikiPageFn
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(null)

    await run(d, ['Broken', 'Alice'])

    // First character threw before creating; second still created.
    expect(d.createWikiPageFn).toHaveBeenCalledTimes(1)
  })
})
