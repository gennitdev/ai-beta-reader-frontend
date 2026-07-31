import { createRevisionDiff } from '@/lib/revisionDiff'

export const BARDWALL_STORAGE_KEY = 'bardwall-game-state'
export const BARDWALL_INN_PRICE = 100

export interface BardwallDailyGoal {
  date: string
  wordCount: number
  wordsTold: number
  coinsEarned: number
  locked: boolean
}

export interface BardwallState {
  coins: number
  storiesTold: number
  totalWordsTold: number
  dailyGoal: BardwallDailyGoal | null
  toldPassageIds: string[]
}

export interface BardwallPassage {
  text: string
  wordCount: number
}

export const createDefaultBardwallState = (): BardwallState => ({
  coins: 0,
  storiesTold: 0,
  totalWordsTold: 0,
  dailyGoal: null,
  toldPassageIds: [],
})

export function getBardwallDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function loadBardwallState(): BardwallState {
  if (typeof localStorage === 'undefined') return createDefaultBardwallState()
  try {
    const stored = JSON.parse(localStorage.getItem(BARDWALL_STORAGE_KEY) ?? 'null') as Partial<BardwallState> | null
    const dailyGoal = stored?.dailyGoal
    const validDailyGoal = dailyGoal && typeof dailyGoal === 'object' && Number(dailyGoal.wordCount) > 0
      ? {
          date: String(dailyGoal.date ?? ''),
          wordCount: Math.max(1, Number(dailyGoal.wordCount) || 1),
          wordsTold: Math.max(0, Number(dailyGoal.wordsTold) || 0),
          coinsEarned: Math.max(0, Number(dailyGoal.coinsEarned) || 0),
          locked: Boolean(dailyGoal.locked),
        }
      : null
    return {
      coins: Math.max(0, Number(stored?.coins) || 0),
      storiesTold: Math.max(0, Number(stored?.storiesTold) || 0),
      totalWordsTold: Math.max(0, Number(stored?.totalWordsTold) || 0),
      dailyGoal: validDailyGoal,
      toldPassageIds: Array.isArray(stored?.toldPassageIds)
        ? stored.toldPassageIds.filter((id): id is string => typeof id === 'string')
        : [],
    }
  } catch {
    return createDefaultBardwallState()
  }
}

export function saveBardwallState(state: BardwallState): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(BARDWALL_STORAGE_KEY, JSON.stringify(state))
  }
}

export function getBardwallPassages(previousText: string, nextText: string): BardwallPassage[] {
  return createRevisionDiff(previousText, nextText)
    .filter((segment) => segment.type === 'added')
    .map((segment) => {
      const text = segment.text.trim()
      return {
        text,
        wordCount: text.match(/[\p{L}\p{N}_’'-]+/gu)?.length ?? 0,
      }
    })
    .filter((passage) => passage.wordCount > 0)
}

export function calculateBardwallPay(wordCount: number, dailyWordGoal: number): number {
  if (wordCount <= 0 || dailyWordGoal <= 0) return 0
  return Math.max(1, Math.round((wordCount / dailyWordGoal) * BARDWALL_INN_PRICE))
}
