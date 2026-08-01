import { createRevisionDiff } from '@/lib/revisionDiff'

export const BARDWALL_STORAGE_KEY = 'bardwall-game-state'
export const BARDWALL_INN_PRICE = 100
export const BARDWALL_DAILY_NOURISHMENT = 100
export const BARDWALL_FLOWER_PRICE = 3

export const HELICONIA_PERSISTENCE_MESSAGES = [
  'You came back. Most miracles begin with something less dramatic and more difficult: coming back.',
  'The page does not ask whether you felt brave. It remembers only that you returned.',
  'A lost cause is merely a cause whose witnesses left too early. Stay a little longer.',
  'You are allowed to write badly today. Persistence is not perfection; it is the refusal to abandon the road.',
  'Some days the work advances by a chapter. Some days by a sentence. Both are movement.',
  'Do not confuse slowness with failure. Roots are slow, and still they split stone.',
  'The unwinnable game still has moves worth making. The impossible book still has pages worth writing.',
  'Rest when you must. Returning after rest is also a form of devotion.',
  'No honest effort is wasted. Even the words you cut taught the surviving words where to stand.',
  'You need not know how the story ends to keep faith with the next true sentence.',
] as const

export const BARDWALL_WYRM_POTIONS = [
  { id: 'gold', name: 'Sun-gold cordial', color: '#e7b84b', ailment: 'Gilded Fever', icon: '☀️', description: 'Your skin burns with fever while every shadow appears full of treasure.' },
  { id: 'blue', name: 'Moon-blue tincture', color: '#6ea8d9', ailment: 'The Lost Lexicon', icon: '🌙', description: 'Common words flee from you precisely when you need them.' },
  { id: 'red', name: 'Ember-red draught', color: '#c95f4b', ailment: 'Smoke Tongue', icon: '🔥', description: 'Every attempted sentence leaves your mouth as a ribbon of smoke.' },
  { id: 'silver', name: 'Silver looking-glass wine', color: '#b8bec7', ailment: 'The Errant Reflection', icon: '🪞', description: 'Your reflection continues moving after you have gone still.' },
  { id: 'clear', name: 'Clear springwater', color: '#b9e2dc', ailment: 'Cave Ague', icon: '💧', description: 'It tastes exactly like water. This somehow makes the illness more insulting.' },
] as const

export const BARDWALL_MARKET_ITEMS = [
  { id: 'apple', name: 'Orchard apple', icon: '🍎', price: 5, nourishment: 25, description: 'Bright, crisp, and easy to carry.' },
  { id: 'bread', name: 'Brown bread', icon: '🍞', price: 12, nourishment: 50, description: 'A sturdy half-loaf from the market ovens.' },
  { id: 'cheese', name: 'Woodsman’s cheese', icon: '🧀', price: 15, nourishment: 50, description: 'Sharp cheese wrapped in waxed cloth.' },
  { id: 'smoked-fish', name: 'Smoked river fish', icon: '🐟', price: 18, nourishment: 75, description: 'Salty, filling, and good for the road.' },
  { id: 'stew', name: 'Market stew', icon: '🥘', price: 22, nourishment: 100, description: 'A full day’s meal in one steaming crock.' },
] as const

export const BARDWALL_CAFE_ITEMS = [
  { id: 'coffee', name: 'Blackthorn coffee', icon: '☕', price: 8, nourishment: 10, description: 'Dark, hot, and capable of reviving an argument.' },
  { id: 'hot-chocolate', name: 'Spiced hot chocolate', icon: '🍫', price: 10, nourishment: 25, description: 'Thick chocolate with cinnamon and a dangerous amount of cream.' },
  { id: 'honey-pastry', name: 'Honey-cardamom pastry', icon: '🥐', price: 14, nourishment: 40, description: 'Flaky, sticky, and best eaten over someone else’s manuscript.' },
  { id: 'coffeehouse-sandwich', name: 'Roast vegetable sandwich', icon: '🥪', price: 20, nourishment: 75, description: 'Warm bread, roast vegetables, sharp cheese, and mustard.' },
] as const

export const BARDWALL_FOOD_ITEMS = [...BARDWALL_MARKET_ITEMS, ...BARDWALL_CAFE_ITEMS] as const

export const BARDWALL_CHALLENGE_CARDS = [
  { id: 'first-light', name: 'The First Light', icon: '🌅', meaning: 'Beginnings, fragile hope, the courage to try.' },
  { id: 'closed-gate', name: 'The Closed Gate', icon: '🚪', meaning: 'Refusal, protection, secrets kept for a reason.' },
  { id: 'last-ember', name: 'The Last Ember', icon: '🔥', meaning: 'Endurance after apparent defeat.' },
  { id: 'two-cups', name: 'Two Cups', icon: '🥂', meaning: 'Friendship, alliance, reconciliation.' },
  { id: 'empty-throne', name: 'The Empty Throne', icon: '🪑', meaning: 'Absence, abandoned power, an inheritance refused.' },
  { id: 'moth', name: 'The Moth', icon: '🦋', meaning: 'Transformation through dangerous desire.' },
  { id: 'long-dusk', name: 'The Long Dusk', icon: '🌆', meaning: 'Endings that refuse to end.' },
  { id: 'ferryman', name: 'The Ferryman', icon: '⛵', meaning: 'Death, passage, an irreversible choice.' },
  { id: 'root-stone', name: 'The Root Beneath Stone', icon: '🌱', meaning: 'Persistence, hidden strength, patient change.' },
  { id: 'unfinished-crown', name: 'The Unfinished Crown', icon: '👑', meaning: 'Ambition, inheritance, glorious failure.' },
  { id: 'winter-wolf', name: 'The Winter Wolf', icon: '🐺', meaning: 'Hunger, loyalty, survival at a price.' },
  { id: 'broken-bell', name: 'The Broken Bell', icon: '🔔', meaning: 'A warning unheard, silence after catastrophe.' },
  { id: 'garden-wall', name: 'The Garden Wall', icon: '🌹', meaning: 'Beauty protected, love constrained, cultivated illusion.' },
  { id: 'falling-star', name: 'The Falling Star', icon: '🌠', meaning: 'A wish granted too late or too literally.' },
  { id: 'mirror-road', name: 'The Mirror Road', icon: '🪞', meaning: 'Identity, doubles, the path not taken.' },
  { id: 'open-hand', name: 'The Open Hand', icon: '🤲', meaning: 'Mercy, surrender, a gift without guarantee.' },
  { id: 'black-lantern', name: 'The Black Lantern', icon: '🏮', meaning: 'Guidance through fear, truth found in darkness.' },
  { id: 'turning-wheel', name: 'The Turning Wheel', icon: '☸️', meaning: 'Fortune, repetition, a pattern finally broken.' },
] as const

export type BardwallFoodId = typeof BARDWALL_FOOD_ITEMS[number]['id']
export type BardwallLodging = 'tent' | 'inn'
export type BardwallPotionId = typeof BARDWALL_WYRM_POTIONS[number]['id']
export type BardwallChallengeCardId = typeof BARDWALL_CHALLENGE_CARDS[number]['id']
export type BardwallInventory = Record<BardwallFoodId | 'tent' | 'flower', number>

export type BardwallChallengeWager = { type: 'coins'; amount: number } | { type: 'item'; itemId: BardwallFoodId }
export interface BardwallChallengeScores { cards: number; coherence: number; invention: number; language: number; length: number }
export interface BardwallChallengeResult {
  outcome: 'win' | 'lose' | 'draw'
  rivalStory: string
  explanation: string
  playerScores: BardwallChallengeScores
  rivalScores: BardwallChallengeScores
}
export interface BardwallChallengeState {
  phase: 'setup' | 'draft' | 'write' | 'result'
  goal: 100 | 250 | 500 | 1000
  wager: BardwallChallengeWager | null
  cards: Array<{ cardId: BardwallChallengeCardId; held: boolean }>
  drawNumber: number
  playerStory: string
  result: BardwallChallengeResult | null
}

export interface BardwallAilment {
  potionId: BardwallPotionId
  name: string
  icon: string
  description: string
}

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
  heliconiaVisits: number
  caveUnlocked: boolean
  ailment: BardwallAilment | null
  triedPotionIds: BardwallPotionId[]
  challenge: BardwallChallengeState
  challengesWon: number
  challengesLost: number
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
    coffee: 0,
    'hot-chocolate': 0,
    'honey-pastry': 0,
    'coffeehouse-sandwich': 0,
  },
  lastNight: null,
  heliconiaMet: false,
  heliconiaVisits: 0,
  caveUnlocked: false,
  ailment: null,
  triedPotionIds: [],
  challenge: { phase: 'setup', goal: 250, wager: null, cards: [], drawNumber: 0, playerStory: '', result: null },
  challengesWon: 0,
  challengesLost: 0,
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

function loadChallenge(value: unknown): BardwallChallengeState {
  const fallback = createDefaultBardwallState().challenge
  if (!value || typeof value !== 'object') return fallback
  const stored = value as Partial<BardwallChallengeState>
  const goals = [100, 250, 500, 1000] as const
  const validCardIds = new Set(BARDWALL_CHALLENGE_CARDS.map((card) => card.id))
  const cards = Array.isArray(stored.cards)
    ? stored.cards.filter((card): card is { cardId: BardwallChallengeCardId; held: boolean } => (
        Boolean(card) && typeof card === 'object' && validCardIds.has(card.cardId as BardwallChallengeCardId)
      )).slice(0, 3).map((card) => ({ cardId: card.cardId, held: Boolean(card.held) }))
    : []
  const phase = stored.phase === 'draft' || stored.phase === 'write' || stored.phase === 'result' ? stored.phase : 'setup'
  return {
    phase: phase !== 'setup' && cards.length !== 3 ? 'setup' : phase,
    goal: goals.includes(stored.goal as typeof goals[number]) ? stored.goal as typeof goals[number] : 250,
    wager: stored.wager && typeof stored.wager === 'object' ? stored.wager : null,
    cards,
    drawNumber: Math.max(0, Math.floor(Number(stored.drawNumber) || 0)),
    playerStory: typeof stored.playerStory === 'string' ? stored.playerStory : '',
    result: stored.result && typeof stored.result === 'object' ? stored.result : null,
  }
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
      heliconiaVisits: Math.max(
        stored?.heliconiaMet ? 1 : 0,
        Math.floor(Number(stored?.heliconiaVisits) || 0),
      ),
      caveUnlocked: Boolean(stored?.caveUnlocked),
      ailment: stored?.ailment && typeof stored.ailment === 'object'
        ? (() => {
            const potion = BARDWALL_WYRM_POTIONS.find((candidate) => candidate.id === stored.ailment?.potionId)
            return potion
              ? { potionId: potion.id, name: potion.ailment, icon: potion.icon, description: potion.description }
              : null
          })()
        : null,
      triedPotionIds: Array.isArray(stored?.triedPotionIds)
        ? stored.triedPotionIds.filter((id): id is BardwallPotionId => BARDWALL_WYRM_POTIONS.some((potion) => potion.id === id))
        : [],
      challenge: loadChallenge(stored?.challenge),
      challengesWon: Math.max(0, Math.floor(Number(stored?.challengesWon) || 0)),
      challengesLost: Math.max(0, Math.floor(Number(stored?.challengesLost) || 0)),
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

export function resetBardwallState(): BardwallState {
  const state = createDefaultBardwallState()
  saveBardwallState(state)
  return state
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
  return BARDWALL_FOOD_ITEMS.reduce((total, item) => (
    total + item.nourishment * Math.max(0, Math.floor(Number(selection[item.id]) || 0))
  ), 0)
}

export function purchaseBardwallFood(state: BardwallState, foodId: BardwallFoodId): BardwallState {
  const item = BARDWALL_FOOD_ITEMS.find((candidate) => candidate.id === foodId)
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

const drawChallengeCards = (excluded: BardwallChallengeCardId[], count: number, random: () => number): BardwallChallengeCardId[] => {
  const available = BARDWALL_CHALLENGE_CARDS.map((card) => card.id).filter((id) => !excluded.includes(id))
  for (let index = available.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[available[index], available[swapIndex]] = [available[swapIndex], available[index]]
  }
  return available.slice(0, count)
}

export function countBardwallWords(text: string): number {
  return text.match(/[\p{L}\p{N}_’'-]+/gu)?.length ?? 0
}

export function startBardwallChallenge(
  state: BardwallState,
  goal: BardwallChallengeState['goal'],
  wager: BardwallChallengeWager,
  random: () => number = Math.random,
): BardwallState {
  const inventory = { ...state.inventory }
  let coins = state.coins
  if (wager.type === 'coins') {
    if (![1, 5, 10].includes(wager.amount) || coins < wager.amount) throw new Error('That coin wager is not available')
    coins -= wager.amount
  } else {
    if (!BARDWALL_FOOD_ITEMS.some((item) => item.id === wager.itemId) || inventory[wager.itemId] < 1) throw new Error('That item is not available to wager')
    inventory[wager.itemId] -= 1
  }
  return {
    ...state,
    coins,
    inventory,
    challenge: {
      phase: 'draft', goal, wager,
      cards: drawChallengeCards([], 3, random).map((cardId) => ({ cardId, held: false })),
      drawNumber: 1, playerStory: '', result: null,
    },
  }
}

export function toggleBardwallChallengeCard(state: BardwallState, cardId: BardwallChallengeCardId): BardwallState {
  if (state.challenge.phase !== 'draft') return state
  return { ...state, challenge: { ...state.challenge, cards: state.challenge.cards.map((card) => card.cardId === cardId ? { ...card, held: !card.held } : card) } }
}

export function advanceBardwallChallengeDraft(state: BardwallState, random: () => number = Math.random): BardwallState {
  if (state.challenge.phase !== 'draft') return state
  const held = state.challenge.cards.filter((card) => card.held)
  if (!held.length) throw new Error('Keep at least one card')
  if (held.length === 3) return { ...state, challenge: { ...state.challenge, phase: 'write' } }
  const excluded = state.challenge.cards.map((card) => card.cardId)
  const replacements = drawChallengeCards(excluded, 3 - held.length, random)
  return {
    ...state,
    challenge: {
      ...state.challenge,
      cards: [...held, ...replacements.map((cardId) => ({ cardId, held: false }))],
      drawNumber: state.challenge.drawNumber + 1,
    },
  }
}

export function resolveBardwallChallenge(state: BardwallState, result: BardwallChallengeResult): BardwallState {
  const wager = state.challenge.wager
  if (!wager) throw new Error('Challenge wager not found')
  const inventory = { ...state.inventory }
  let coins = state.coins
  const multiplier = result.outcome === 'win' ? 3 : result.outcome === 'draw' ? 1 : 0
  if (wager.type === 'coins') coins += wager.amount * multiplier
  else inventory[wager.itemId] += multiplier
  return {
    ...state,
    coins,
    inventory,
    challengesWon: state.challengesWon + (result.outcome === 'win' ? 1 : 0),
    challengesLost: state.challengesLost + (result.outcome === 'lose' ? 1 : 0),
    challenge: { ...state.challenge, phase: 'result', result },
  }
}

export function resetBardwallChallenge(state: BardwallState): BardwallState {
  return { ...state, challenge: createDefaultBardwallState().challenge }
}

export function offerFlowerToHeliconia(state: BardwallState): BardwallState {
  if (state.inventory.flower < 1) throw new Error('A flower is required')
  return {
    ...state,
    inventory: { ...state.inventory, flower: state.inventory.flower - 1 },
    heliconiaMet: true,
    heliconiaVisits: state.heliconiaVisits + 1,
    caveUnlocked: true,
  }
}

export function drinkWyrmPotion(state: BardwallState, potionId: BardwallPotionId): BardwallState {
  if (state.ailment) throw new Error('The bard must be healed first')
  const potion = BARDWALL_WYRM_POTIONS.find((candidate) => candidate.id === potionId)
  if (!potion) throw new Error('Potion not found')
  return {
    ...state,
    energy: Math.max(0, state.energy - 25),
    ailment: { potionId: potion.id, name: potion.ailment, icon: potion.icon, description: potion.description },
    triedPotionIds: [...new Set([...state.triedPotionIds, potion.id])],
  }
}

export function healBardAtApothecary(state: BardwallState): BardwallState {
  if (!state.ailment) return state
  return {
    ...state,
    energy: Math.min(100, state.energy + 25),
    ailment: null,
  }
}

export function resolveBardwallNight(
  state: BardwallState,
  lodging: BardwallLodging,
  selection: Partial<Record<BardwallFoodId, number>>,
): BardwallState {
  if (lodging === 'inn' && state.coins < BARDWALL_INN_PRICE) throw new Error('Not enough coins for the inn')

  const inventory = { ...state.inventory }
  for (const item of BARDWALL_FOOD_ITEMS) {
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
