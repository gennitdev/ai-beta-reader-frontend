import { computed, ref, type Ref } from 'vue'
import { loadOpenAIApiKey } from '@/lib/apiKeyStorage'
import {
  appendBardwallLastWordExchange,
  countBardwallWords,
  saveBardwallState,
  startBardwallLastWordStory,
  updateBardwallLastWordDraft,
  type BardwallState,
} from '@/lib/bardwall'
import { continueBardwallLastWordStory } from '@/lib/openai'

interface BardwallLastWordDependencies {
  loadApiKey: () => Promise<string | null>
  continueStory: typeof continueBardwallLastWordStory
  saveState: (state: BardwallState) => void
}

const defaultDependencies: BardwallLastWordDependencies = {
  loadApiKey: loadOpenAIApiKey,
  continueStory: continueBardwallLastWordStory,
  saveState: saveBardwallState,
}

export function useBardwallLastWord(
  game: Ref<BardwallState>,
  dependencies: BardwallLastWordDependencies = defaultDependencies,
) {
  const selectedLastWordStoryId = ref<string | null>(null)
  const lastWordMessage = ref<string | null>(null)
  const vesperSpeaking = ref(false)

  const lastWordStories = computed(() => (
    [...game.value.lastWordStories].sort((left, right) => (
      right.updatedAt.localeCompare(left.updatedAt)
    ))
  ))
  const selectedLastWordStory = computed(() => (
    game.value.lastWordStories.find((story) => story.id === selectedLastWordStoryId.value) ?? null
  ))
  const lastWordDraftCount = computed(() => (
    countBardwallWords(selectedLastWordStory.value?.draft ?? '')
  ))
  const canAskVesper = computed(() => (
    Boolean(selectedLastWordStory.value)
    && lastWordDraftCount.value >= 1
    && lastWordDraftCount.value <= 2000
    && !vesperSpeaking.value
  ))

  const persist = (state: BardwallState) => {
    game.value = state
    dependencies.saveState(state)
  }

  const beginLastWordStory = () => {
    const created = startBardwallLastWordStory(game.value)
    persist(created.state)
    selectedLastWordStoryId.value = created.storyId
    lastWordMessage.value = null
  }

  const openLastWordStory = (storyId: string) => {
    selectedLastWordStoryId.value = storyId
    lastWordMessage.value = null
  }

  const returnToLastWordShelf = () => {
    selectedLastWordStoryId.value = null
    lastWordMessage.value = null
  }

  const updateLastWordDraft = (draft: string) => {
    if (!selectedLastWordStoryId.value) return
    persist(updateBardwallLastWordDraft(
      game.value,
      selectedLastWordStoryId.value,
      draft,
    ))
  }

  const askVesperToContinue = async () => {
    const story = selectedLastWordStory.value
    if (!story || !canAskVesper.value) return

    const bardText = story.draft
    const targetWords = lastWordDraftCount.value
    vesperSpeaking.value = true
    lastWordMessage.value = null

    try {
      let apiKey: string | null
      try {
        apiKey = await dependencies.loadApiKey()
      } catch (error) {
        lastWordMessage.value = error instanceof Error
          ? error.message
          : 'The saved OpenAI API key could not be loaded.'
        return
      }

      if (!apiKey) {
        lastWordMessage.value = 'Add your OpenAI API key in Settings before Vesper can answer.'
        return
      }

      try {
        const continuation = await dependencies.continueStory(apiKey, {
          title: story.title,
          turns: story.turns.map((turn) => ({
            speaker: turn.speaker,
            text: turn.text,
          })),
          bardText,
          targetWords,
        })
        persist(appendBardwallLastWordExchange(
          game.value,
          story.id,
          bardText,
          continuation,
        ))
        lastWordMessage.value = `You offered ${countBardwallWords(bardText).toLocaleString()} words. Vesper answered with ${countBardwallWords(continuation).toLocaleString()}. He still has the last word.`
      } catch (error) {
        lastWordMessage.value = error instanceof Error
          ? error.message
          : 'Vesper fell unexpectedly silent.'
      }
    } finally {
      vesperSpeaking.value = false
    }
  }

  const resetLastWordUi = () => {
    selectedLastWordStoryId.value = null
    lastWordMessage.value = null
    vesperSpeaking.value = false
  }

  const formatLastWordDate = (value: string) => {
    if (!value) return 'Awaiting its first words'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Date unknown'
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  }

  return {
    selectedLastWordStoryId,
    lastWordMessage,
    vesperSpeaking,
    lastWordStories,
    selectedLastWordStory,
    lastWordDraftCount,
    canAskVesper,
    beginLastWordStory,
    openLastWordStory,
    returnToLastWordShelf,
    updateLastWordDraft,
    askVesperToContinue,
    resetLastWordUi,
    formatLastWordDate,
  }
}
