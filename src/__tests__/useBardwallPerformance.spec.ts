import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useBardwallPerformance } from '@/composables/useBardwallPerformance'
import { createDefaultBardwallState, type BardwallState } from '@/lib/bardwall'
import type { RevisionOffering, RewardPassage } from '@/types/bardwallView'

const today = '2026-08-20'

const passage = (id: string, wordCount = 25): RewardPassage => ({
  id,
  text: `Passage ${id}`,
  wordCount,
})

const offering = (passages: RewardPassage[] = [passage('revision-1:0')]): RevisionOffering => ({
  id: 'revision-1',
  bookTitle: 'The Book',
  chapterTitle: 'The Chapter',
  createdAt: '2026-08-20T12:00:00.000Z',
  passages,
  wordCount: passages.reduce((total, item) => total + item.wordCount, 0),
})

const setup = (initialState: BardwallState = createDefaultBardwallState()) => {
  const game = ref(initialState)
  const selectedOffering = ref<RevisionOffering | null>(offering())
  const selectedPassages = ref<RewardPassage[]>(selectedOffering.value?.passages ?? [])
  const selectedWordCount = computed(() => (
    selectedPassages.value.reduce((total, item) => total + item.wordCount, 0)
  ))
  const removeToldPassages = vi.fn()
  const calculatePay = vi.fn((words: number, goal: number) => words + goal)
  const saveState = vi.fn()
  const performance = useBardwallPerformance(game, {
    selectedOffering,
    selectedPassages,
    selectedWordCount,
    removeToldPassages,
  }, {
    calculatePay,
    getDateKey: () => today,
    saveState,
  })

  return {
    game,
    selectedOffering,
    selectedPassages,
    removeToldPassages,
    calculatePay,
    saveState,
    ...performance,
  }
}

describe('useBardwallPerformance goals', () => {
  it('ignores stale goals and derives current progress and expected pay', () => {
    const state = createDefaultBardwallState()
    state.dailyGoal = {
      date: '2026-08-19',
      wordCount: 500,
      wordsTold: 250,
      coinsEarned: 10,
      locked: true,
    }
    const result = setup(state)

    expect(result.dailyGoal.value).toBeNull()
    expect(result.dailyProgress.value).toBe(0)
    expect(result.expectedPay.value).toBe(25)
    expect(result.calculatePay).toHaveBeenLastCalledWith(25, 0)

    result.game.value.dailyGoal = { ...state.dailyGoal, date: today, wordsTold: 750 }
    expect(result.dailyProgress.value).toBe(100)
    expect(result.expectedPay.value).toBe(525)
    expect(result.calculatePay).toHaveBeenLastCalledWith(25, 500)
  })

  it('rejects non-finite and sub-word goals, then rounds and persists a valid goal', () => {
    const result = setup()

    result.goalChoice.value = 'custom'
    for (const invalidGoal of ['', 'not-a-number', '0.4', '-10']) {
      result.customGoal.value = invalidGoal
      expect(result.validChosenGoal.value).toBe(false)
      expect(result.setDailyGoal()).toBe(false)
    }
    expect(result.saveState).not.toHaveBeenCalled()

    result.customGoal.value = '125.6'
    expect(result.validChosenGoal.value).toBe(true)
    expect(result.chosenGoal.value).toBe(125.6)
    expect(result.setDailyGoal()).toBe(true)
    expect(result.game.value.dailyGoal).toEqual({
      date: today,
      wordCount: 126,
      wordsTold: 0,
      coinsEarned: 0,
      locked: false,
    })
    expect(result.saveState).toHaveBeenCalledWith(result.game.value)
  })
})

describe('useBardwallPerformance rewards', () => {
  it('does nothing without a current goal, offering, or selected words', () => {
    const result = setup()

    expect(result.tellStory()).toBe(false)
    result.game.value.dailyGoal = {
      date: today,
      wordCount: 500,
      wordsTold: 0,
      coinsEarned: 0,
      locked: false,
    }
    result.selectedOffering.value = null
    expect(result.tellStory()).toBe(false)
    result.selectedOffering.value = offering()
    result.selectedPassages.value = []
    expect(result.tellStory()).toBe(false)

    expect(result.saveState).not.toHaveBeenCalled()
    expect(result.removeToldPassages).not.toHaveBeenCalled()
  })

  it('persists rewards, locks the goal, deduplicates passages, and consumes the offering', () => {
    const firstPassage = passage('revision-1:0', 20)
    const secondPassage = passage('revision-1:1', 30)
    const state = createDefaultBardwallState()
    state.coins = 4
    state.storiesTold = 2
    state.totalWordsTold = 80
    state.toldPassageIds = [firstPassage.id]
    state.dailyGoal = {
      date: today,
      wordCount: 500,
      wordsTold: 100,
      coinsEarned: 3,
      locked: false,
    }
    const result = setup(state)
    result.selectedOffering.value = offering([firstPassage, secondPassage])
    result.selectedPassages.value = [firstPassage, secondPassage]

    expect(result.tellStory()).toBe(true)
    expect(result.game.value).toMatchObject({
      coins: 554,
      storiesTold: 3,
      totalWordsTold: 130,
      toldPassageIds: [firstPassage.id, secondPassage.id],
      dailyGoal: {
        date: today,
        wordCount: 500,
        wordsTold: 150,
        coinsEarned: 553,
        locked: true,
      },
    })
    expect(result.saveState).toHaveBeenCalledWith(result.game.value)
    expect(result.removeToldPassages).toHaveBeenCalledWith([firstPassage.id, secondPassage.id])
    expect(result.lastReward.value).toEqual({ coins: 550, words: 50 })
  })

  it('does not consume passages or expose a reward when persistence fails', () => {
    const state = createDefaultBardwallState()
    state.dailyGoal = {
      date: today,
      wordCount: 500,
      wordsTold: 0,
      coinsEarned: 0,
      locked: false,
    }
    const result = setup(state)
    result.saveState.mockImplementationOnce(() => {
      throw new Error('storage full')
    })

    expect(() => result.tellStory()).toThrow('storage full')
    expect(result.game.value).toStrictEqual(state)
    expect(result.removeToldPassages).not.toHaveBeenCalled()
    expect(result.lastReward.value).toEqual({ coins: 0, words: 0 })
  })

  it('resets transient goal and reward state without changing the game', () => {
    const result = setup()
    const originalGame = result.game.value
    result.goalChoice.value = 'custom'
    result.customGoal.value = '900'
    result.lastReward.value = { coins: 12, words: 60 }

    result.resetPerformanceUi()

    expect(result.goalChoice.value).toBe(500)
    expect(result.customGoal.value).toBe('')
    expect(result.lastReward.value).toEqual({ coins: 0, words: 0 })
    expect(result.game.value).toBe(originalGame)
  })
})
