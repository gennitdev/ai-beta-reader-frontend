import { computed, ref, type Ref } from 'vue'
import {
  calculateBardwallPay,
  getBardwallDateKey,
  saveBardwallState,
  type BardwallState,
} from '@/lib/bardwall'
import type { RevisionOffering, RewardPassage } from '@/types/bardwallView'

interface BardwallPerformanceOfferings {
  selectedOffering: Readonly<Ref<RevisionOffering | null>>
  selectedPassages: Readonly<Ref<readonly RewardPassage[]>>
  selectedWordCount: Readonly<Ref<number>>
  removeToldPassages: (passageIds: readonly string[]) => void
}

interface BardwallPerformanceDependencies {
  calculatePay: typeof calculateBardwallPay
  getDateKey: typeof getBardwallDateKey
  saveState: (state: BardwallState) => void
}

const defaultDependencies: BardwallPerformanceDependencies = {
  calculatePay: calculateBardwallPay,
  getDateKey: getBardwallDateKey,
  saveState: saveBardwallState,
}

export function useBardwallPerformance(
  game: Ref<BardwallState>,
  offerings: BardwallPerformanceOfferings,
  dependencies: BardwallPerformanceDependencies = defaultDependencies,
) {
  const lastReward = ref({ coins: 0, words: 0 })
  const goalChoice = ref<number | 'custom'>(500)
  const customGoal = ref('')

  const todayKey = computed(() => dependencies.getDateKey())
  const dailyGoal = computed(() => (
    game.value.dailyGoal?.date === todayKey.value ? game.value.dailyGoal : null
  ))
  const chosenGoal = computed(() => (
    goalChoice.value === 'custom' ? Number(customGoal.value) : goalChoice.value
  ))
  const normalizedChosenGoal = computed(() => Math.round(chosenGoal.value))
  const validChosenGoal = computed(() => (
    Number.isFinite(chosenGoal.value) && normalizedChosenGoal.value > 0
  ))
  const expectedPay = computed(() => dependencies.calculatePay(
    offerings.selectedWordCount.value,
    dailyGoal.value?.wordCount ?? 0,
  ))
  const dailyProgress = computed(() => {
    if (!dailyGoal.value) return 0
    return Math.min(100, (dailyGoal.value.wordsTold / dailyGoal.value.wordCount) * 100)
  })

  const persist = (state: BardwallState) => {
    dependencies.saveState(state)
    game.value = state
  }

  const setDailyGoal = () => {
    if (!validChosenGoal.value) return false

    persist({
      ...game.value,
      dailyGoal: {
        date: todayKey.value,
        wordCount: normalizedChosenGoal.value,
        wordsTold: 0,
        coinsEarned: 0,
        locked: false,
      },
    })
    return true
  }

  const tellStory = () => {
    const goal = dailyGoal.value
    if (!goal || !offerings.selectedOffering.value || offerings.selectedWordCount.value === 0) {
      return false
    }

    const words = offerings.selectedWordCount.value
    const coins = expectedPay.value
    const newlyToldPassageIds = offerings.selectedPassages.value.map((passage) => passage.id)
    persist({
      ...game.value,
      coins: game.value.coins + coins,
      storiesTold: game.value.storiesTold + 1,
      totalWordsTold: game.value.totalWordsTold + words,
      dailyGoal: {
        ...goal,
        wordsTold: goal.wordsTold + words,
        coinsEarned: goal.coinsEarned + coins,
        locked: true,
      },
      toldPassageIds: [...new Set([...game.value.toldPassageIds, ...newlyToldPassageIds])],
    })
    offerings.removeToldPassages(newlyToldPassageIds)
    lastReward.value = { coins, words }
    return true
  }

  const resetPerformanceUi = () => {
    lastReward.value = { coins: 0, words: 0 }
    goalChoice.value = 500
    customGoal.value = ''
  }

  return {
    lastReward,
    goalChoice,
    customGoal,
    dailyGoal,
    chosenGoal,
    validChosenGoal,
    expectedPay,
    dailyProgress,
    setDailyGoal,
    tellStory,
    resetPerformanceUi,
  }
}
