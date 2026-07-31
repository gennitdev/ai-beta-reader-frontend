import { createRevisionDiff } from '@/lib/revisionDiff'

export const BARDWALL_STORAGE_KEY = 'bardwall-game-state'
export const BARDWALL_INN_PRICE = 100
export const BARDWALL_DAILY_NOURISHMENT = 100
export const BARDWALL_FLOWER_PRICE = 3

export const BARDWALL_MARKET_ITEMS = [
  { id: 'apple', name: 'Orchard apple', icon: '🍎', price: 5, nourishment: 25, description: 'Bright, crisp, and easy to carry.' },
  { id: 'bread', name: 'Brown bread', icon: '🍞', price: 12, nourishment: 50, description: 'A sturdy half-loaf from the market ovens.' },
  { id: 'cheese', name: 'Woodsman’s cheese', icon: '🧀', price: 15, nourishment: 50, description: 'Sharp cheese wrapped in waxed cloth.' },
  { id: 'smoked-fish', name: 'Smoked river fish', icon: '🐟', price: 18, nourishment: 75, description: 'Salty, filling, and good for the road.' },
  { id: 'stew', name: 'Market stew', icon: '🥘', price: 22, nourishment: 100, description: 'A full day’s meal in one steaming crock.' },
] as const

export type BardwallFoodId = typeof BARDWALL_MARKET_ITEMS[number]['id']
export type BardwallLodging = 'tent' | 'inn'
export type BardwallInventory = Record<BardwallFoodId | 'tent' | 'flower', number>

export interface BardwallNightSummary {
  day: number
  lodging: BardwallLodging
  nourishment: number
  hunger: number
  energy: number
}

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
  day: number
  energy: number
  hunger: number
  inventory: BardwallInventory
  lastNight: BardwallNightSummary | null
  heliconiaMet: boolean
  caveUnlocked: boolean
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
  day: 1,
  energy: 100,
  hunger: 0,
  inventory: {
    tent: 1,
    flower: 0,
    apple: 0,
    bread: 1,
    cheese: 1,
    'smoked-fish': 0,
    stew: 0,
  },
  lastNight: null,
  heliconiaMet: false,
  caveUnlocked: false,
})

const clampMeter = (value: unknown, fallback: number): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : fallback
}

function loadInventory(value: unknown): BardwallInventory {
  const fallback = createDefaultBardwallState().inventory
  if (!value || typeof value !== 'object') return fallback
  const stored = value as Partial<BardwallInventory>
  return Object.fromEntries(
    Object.keys(fallback).map((id) => [id, Math.max(0, Math.floor(Number(stored[id as keyof BardwallInventory]) || 0))]),
  ) as BardwallInventory
}

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
      day: Math.max(1, Math.floor(Number(stored?.day) || 1)),
      energy: clampMeter(stored?.energy, 100),
      hunger: clampMeter(stored?.hunger, 0),
      inventory: loadInventory(stored?.inventory),
      lastNight: stored?.lastNight && typeof stored.lastNight === 'object'
        ? {
            day: Math.max(1, Math.floor(Number(stored.lastNight.day) || 1)),
            lodging: stored.lastNight.lodging === 'inn' ? 'inn' : 'tent',
            nourishment: Math.max(0, Number(stored.lastNight.nourishment) || 0),
            hunger: clampMeter(stored.lastNight.hunger, 0),
            energy: clampMeter(stored.lastNight.energy, 100),
          }
        : null,
      heliconiaMet: Boolean(stored?.heliconiaMet),
      caveUnlocked: Boolean(stored?.caveUnlocked),
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

export function getBardwallNourishment(selection: Partial<Record<BardwallFoodId, number>>): number {
  return BARDWALL_MARKET_ITEMS.reduce((total, item) => (
    total + item.nourishment * Math.max(0, Math.floor(Number(selection[item.id]) || 0))
  ), 0)
}

export function purchaseBardwallFood(state: BardwallState, foodId: BardwallFoodId): BardwallState {
  const item = BARDWALL_MARKET_ITEMS.find((candidate) => candidate.id === foodId)
  if (!item) throw new Error('Food not found')
  if (state.coins < item.price) throw new Error('Not enough coins')
  return {
    ...state,
    coins: state.coins - item.price,
    inventory: { ...state.inventory, [foodId]: state.inventory[foodId] + 1 },
  }
}

export function purchaseBardwallFlower(state: BardwallState): BardwallState {
  if (state.coins < BARDWALL_FLOWER_PRICE) throw new Error('Not enough coins')
  return {
    ...state,
    coins: state.coins - BARDWALL_FLOWER_PRICE,
    inventory: { ...state.inventory, flower: state.inventory.flower + 1 },
  }
}

export function offerFlowerToHeliconia(state: BardwallState): BardwallState {
  if (state.inventory.flower < 1) throw new Error('A flower is required')
  return {
    ...state,
    inventory: { ...state.inventory, flower: state.inventory.flower - 1 },
    heliconiaMet: true,
    caveUnlocked: true,
  }
}

export function resolveBardwallNight(
  state: BardwallState,
  lodging: BardwallLodging,
  selection: Partial<Record<BardwallFoodId, number>>,
): BardwallState {
  if (lodging === 'inn' && state.coins < BARDWALL_INN_PRICE) throw new Error('Not enough coins for the inn')

  const inventory = { ...state.inventory }
  for (const item of BARDWALL_MARKET_ITEMS) {
    const quantity = Math.max(0, Math.floor(Number(selection[item.id]) || 0))
    if (quantity > inventory[item.id]) throw new Error(`Not enough ${item.name}`)
    inventory[item.id] -= quantity
  }

  const nourishment = getBardwallNourishment(selection)
  const hunger = Math.max(0, BARDWALL_DAILY_NOURISHMENT - nourishment)
  const restEnergy = lodging === 'inn' ? 100 : 75
  const energy = Math.max(0, restEnergy - Math.round(hunger / 2))
  const nextDay = state.day + 1

  return {
    ...state,
    coins: state.coins - (lodging === 'inn' ? BARDWALL_INN_PRICE : 0),
    day: nextDay,
    energy,
    hunger,
    inventory,
    dailyGoal: null,
    lastNight: { day: nextDay, lodging, nourishment, hunger, energy },
  }
}
