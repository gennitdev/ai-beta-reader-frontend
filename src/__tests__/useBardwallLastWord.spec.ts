import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBardwallLastWord } from '@/composables/useBardwallLastWord'
import {
  createDefaultBardwallState,
  type BardwallLastWordStory,
  type BardwallState,
} from '@/lib/bardwall'

function story(overrides: Partial<BardwallLastWordStory> = {}): BardwallLastWordStory {
  return {
    id: 'story-1',
    title: 'An Unfinished Story',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    draft: '',
    turns: [],
    ...overrides,
  }
}

function stateWithStories(stories: BardwallLastWordStory[]): BardwallState {
  return { ...createDefaultBardwallState(), lastWordStories: stories }
}

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `word${index}`).join(' ')
}

function createFlow(state: BardwallState = createDefaultBardwallState()) {
  const game = ref(state)
  const loadApiKey = vi.fn(async () => 'sk-test')
  const continueStory = vi.fn(async () => 'and something answered from below')
  const saveState = vi.fn()
  const flow = useBardwallLastWord(game, { loadApiKey, continueStory, saveState })
  return { game, loadApiKey, continueStory, saveState, flow }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useBardwallLastWord story state', () => {
  it('sorts the story shelf, selects stories, and clears shelf state', () => {
    const older = story({ id: 'older', updatedAt: '2026-08-01T00:00:00.000Z' })
    const newer = story({ id: 'newer', updatedAt: '2026-08-03T00:00:00.000Z' })
    const { flow } = createFlow(stateWithStories([older, newer]))

    expect(flow.lastWordStories.value.map((entry) => entry.id)).toEqual(['newer', 'older'])
    flow.openLastWordStory('older')
    expect(flow.selectedLastWordStory.value?.id).toBe('older')
    flow.lastWordMessage.value = 'old message'
    flow.returnToLastWordShelf()
    expect(flow.selectedLastWordStory.value).toBeNull()
    expect(flow.lastWordMessage.value).toBeNull()
  })

  it('creates and persists a new selected story', () => {
    const { game, saveState, flow } = createFlow()

    flow.beginLastWordStory()

    expect(game.value.lastWordStories).toHaveLength(1)
    expect(flow.selectedLastWordStory.value).toEqual(expect.objectContaining({
      title: 'An Unfinished Story',
      draft: '',
      turns: [],
    }))
    expect(saveState).toHaveBeenCalledWith(game.value)
  })

  it('persists selected drafts and derives submission eligibility', () => {
    const { game, saveState, flow } = createFlow(stateWithStories([story()]))
    flow.updateLastWordDraft('ignored without a selection')
    expect(saveState).not.toHaveBeenCalled()

    flow.openLastWordStory('story-1')
    flow.updateLastWordDraft('Once beneath the roots')
    expect(game.value.lastWordStories[0].draft).toBe('Once beneath the roots')
    expect(flow.lastWordDraftCount.value).toBe(4)
    expect(flow.canAskVesper.value).toBe(true)

    flow.updateLastWordDraft(words(2001))
    expect(flow.lastWordDraftCount.value).toBe(2001)
    expect(flow.canAskVesper.value).toBe(false)
    expect(saveState).toHaveBeenCalledTimes(2)
  })

  it('formats missing and malformed dates safely', () => {
    const { flow } = createFlow()
    expect(flow.formatLastWordDate('')).toBe('Awaiting its first words')
    expect(flow.formatLastWordDate('not-a-date')).toBe('Date unknown')
    expect(flow.formatLastWordDate('2026-08-01T00:00:00.000Z')).toMatch(/2026/)
  })
})

describe('useBardwallLastWord continuation', () => {
  function readyFlow() {
    const existing = story({
      draft: 'Once beneath the roots',
      turns: [
        {
          speaker: 'bard', text: 'Earlier words', wordCount: 2,
          createdAt: '2026-07-31T00:00:00.000Z',
        },
        {
          speaker: 'vesper', text: 'An earlier answer', wordCount: 3,
          createdAt: '2026-07-31T00:00:01.000Z',
        },
      ],
    })
    const result = createFlow(stateWithStories([existing]))
    result.flow.openLastWordStory(existing.id)
    return result
  }

  it('does not authenticate or call the model for absent or oversized drafts', async () => {
    const absent = createFlow(stateWithStories([story()]))
    absent.flow.openLastWordStory('story-1')
    await absent.flow.askVesperToContinue()
    expect(absent.loadApiKey).not.toHaveBeenCalled()

    absent.flow.updateLastWordDraft(words(2001))
    await absent.flow.askVesperToContinue()
    expect(absent.loadApiKey).not.toHaveBeenCalled()
    expect(absent.continueStory).not.toHaveBeenCalled()
  })

  it('reports missing and unreadable keys and always clears the lock', async () => {
    const missing = readyFlow()
    missing.loadApiKey.mockResolvedValue(null)
    await missing.flow.askVesperToContinue()
    expect(missing.flow.lastWordMessage.value).toContain('Add your OpenAI API key')
    expect(missing.flow.vesperSpeaking.value).toBe(false)

    const unreadable = readyFlow()
    unreadable.loadApiKey.mockRejectedValue('secure storage unavailable')
    await unreadable.flow.askVesperToContinue()
    expect(unreadable.flow.lastWordMessage.value).toBe(
      'The saved OpenAI API key could not be loaded.',
    )
    expect(unreadable.continueStory).not.toHaveBeenCalled()
    expect(unreadable.flow.vesperSpeaking.value).toBe(false)
  })

  it('locks before credential loading so duplicate submits make one request', async () => {
    const state = readyFlow()
    let resolveKey!: (key: string) => void
    state.loadApiKey.mockImplementationOnce(() => new Promise((resolve) => {
      resolveKey = resolve
    }))

    const first = state.flow.askVesperToContinue()
    const duplicate = state.flow.askVesperToContinue()
    expect(state.flow.vesperSpeaking.value).toBe(true)
    expect(state.loadApiKey).toHaveBeenCalledOnce()
    resolveKey('sk-test')
    await Promise.all([first, duplicate])

    expect(state.continueStory).toHaveBeenCalledOnce()
    expect(state.saveState).toHaveBeenCalledOnce()
  })

  it('submits story context and persists both completed turns', async () => {
    const { game, continueStory, saveState, flow } = readyFlow()

    await flow.askVesperToContinue()

    expect(continueStory).toHaveBeenCalledWith('sk-test', {
      title: 'An Unfinished Story',
      turns: [
        { speaker: 'bard', text: 'Earlier words' },
        { speaker: 'vesper', text: 'An earlier answer' },
      ],
      bardText: 'Once beneath the roots',
      targetWords: 4,
    })
    expect(game.value.lastWordStories[0]).toMatchObject({
      draft: '',
      turns: [
        { speaker: 'bard', text: 'Earlier words' },
        { speaker: 'vesper', text: 'An earlier answer' },
        { speaker: 'bard', text: 'Once beneath the roots', wordCount: 4 },
        { speaker: 'vesper', text: 'and something answered from below', wordCount: 5 },
      ],
    })
    expect(saveState).toHaveBeenCalledOnce()
    expect(flow.lastWordMessage.value).toBe(
      'You offered 4 words. Vesper answered with 5. He still has the last word.',
    )
    expect(flow.vesperSpeaking.value).toBe(false)
  })

  it('surfaces continuation failures without consuming the draft', async () => {
    const { game, continueStory, saveState, flow } = readyFlow()
    continueStory.mockRejectedValue('model unavailable')

    await flow.askVesperToContinue()

    expect(flow.lastWordMessage.value).toBe('Vesper fell unexpectedly silent.')
    expect(game.value.lastWordStories[0].draft).toBe('Once beneath the roots')
    expect(saveState).not.toHaveBeenCalled()
    expect(flow.vesperSpeaking.value).toBe(false)
  })

  it('resets transient selection, messages, and busy state', () => {
    const { flow } = readyFlow()
    flow.lastWordMessage.value = 'old message'
    flow.vesperSpeaking.value = true

    flow.resetLastWordUi()

    expect(flow.selectedLastWordStory.value).toBeNull()
    expect(flow.lastWordMessage.value).toBeNull()
    expect(flow.vesperSpeaking.value).toBe(false)
  })
})
