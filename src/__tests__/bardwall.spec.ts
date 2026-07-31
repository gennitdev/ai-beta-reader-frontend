// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  BARDWALL_STORAGE_KEY,
  calculateBardwallPay,
  createDefaultBardwallState,
  drinkWyrmPotion,
  getBardwallDateKey,
  getBardwallPassages,
  healBardAtApothecary,
  loadBardwallState,
  offerFlowerToHeliconia,
  purchaseBardwallFood,
  purchaseBardwallFlower,
  resolveBardwallNight,
  saveBardwallState,
} from '@/lib/bardwall'

afterEach(() => localStorage.clear())

describe('Bardwall game helpers', () => {
  it('extracts newly added story passages from a revision', () => {
    expect(getBardwallPassages('The moon was pale.', 'The moon was very bright.')).toEqual([
      { text: 'very bright', wordCount: 2 },
    ])
  })

  it('makes the daily word goal worth exactly one night at the inn', () => {
    expect(calculateBardwallPay(0, 500)).toBe(0)
    expect(calculateBardwallPay(250, 500)).toBe(50)
    expect(calculateBardwallPay(500, 500)).toBe(100)
    expect(calculateBardwallPay(750, 500)).toBe(150)
  })

  it('uses the writer local calendar day for daily goals', () => {
    expect(getBardwallDateKey(new Date(2026, 6, 31, 23, 30))).toBe('2026-07-31')
  })

  it('persists progress and safely handles invalid storage', () => {
    saveBardwallState({
      ...createDefaultBardwallState(),
      coins: 7,
      storiesTold: 2,
      totalWordsTold: 340,
      dailyGoal: { date: '2026-07-31', wordCount: 500, wordsTold: 340, coinsEarned: 68, locked: true },
      toldPassageIds: ['revision-1:0'],
    })
    expect(loadBardwallState()).toMatchObject({
      coins: 7,
      dailyGoal: { wordCount: 500, wordsTold: 340, locked: true },
      toldPassageIds: ['revision-1:0'],
    })

    localStorage.setItem(BARDWALL_STORAGE_KEY, 'not-json')
    expect(loadBardwallState()).toEqual({
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
      ailment: null,
      triedPotionIds: [],
    })
  })

  it('gives existing Bardwall saves the starter inventory when migrating', () => {
    localStorage.setItem(BARDWALL_STORAGE_KEY, JSON.stringify({ coins: 9, storiesTold: 1 }))

    expect(loadBardwallState()).toMatchObject({
      coins: 9,
      day: 1,
      energy: 100,
      hunger: 0,
      inventory: { tent: 1, bread: 1, cheese: 1 },
    })
  })

  it('buys food and keeps it in the persistent inventory', () => {
    const state = { ...createDefaultBardwallState(), coins: 30 }
    const purchased = purchaseBardwallFood(state, 'bread')

    expect(purchased.coins).toBe(18)
    expect(purchased.inventory.bread).toBe(2)
    expect(() => purchaseBardwallFood(createDefaultBardwallState(), 'stew')).toThrow('Not enough coins')
  })

  it('buys and offers a flower to reveal Heliconia’s cave', () => {
    const purchased = purchaseBardwallFlower({ ...createDefaultBardwallState(), coins: 3 })
    expect(purchased).toMatchObject({ coins: 0, inventory: { flower: 1 } })

    const revealed = offerFlowerToHeliconia(purchased)
    expect(revealed).toMatchObject({ inventory: { flower: 0 }, heliconiaMet: true, caveUnlocked: true })
    expect(() => offerFlowerToHeliconia(createDefaultBardwallState())).toThrow('A flower is required')
  })

  it('applies every wyrm potion as an illness and lets the apothecary heal it', () => {
    const poisoned = drinkWyrmPotion(createDefaultBardwallState(), 'gold')
    expect(poisoned).toMatchObject({
      energy: 75,
      ailment: { potionId: 'gold', name: 'Gilded Fever' },
      triedPotionIds: ['gold'],
    })
    expect(() => drinkWyrmPotion(poisoned, 'blue')).toThrow('must be healed first')

    const healed = healBardAtApothecary(poisoned)
    expect(healed).toMatchObject({ energy: 100, ailment: null, triedPotionIds: ['gold'] })
  })

  it('consumes a full meal and applies lodging energy at the end of the day', () => {
    const state = {
      ...createDefaultBardwallState(),
      coins: 100,
      dailyGoal: { date: '2026-07-31', wordCount: 500, wordsTold: 500, coinsEarned: 100, locked: true },
    }
    const nextDay = resolveBardwallNight(state, 'inn', { bread: 1, cheese: 1 })

    expect(nextDay).toMatchObject({ coins: 0, day: 2, energy: 100, hunger: 0, dailyGoal: null })
    expect(nextDay.inventory).toMatchObject({ bread: 0, cheese: 0, tent: 1 })
    expect(nextDay.lastNight).toMatchObject({ lodging: 'inn', nourishment: 100 })
  })

  it('makes an underfed tent sleeper hungry and less energetic the next day', () => {
    const nextDay = resolveBardwallNight(createDefaultBardwallState(), 'tent', { bread: 1 })

    expect(nextDay).toMatchObject({ day: 2, hunger: 50, energy: 50 })
    expect(() => resolveBardwallNight(createDefaultBardwallState(), 'inn', {})).toThrow('Not enough coins for the inn')
  })
})
