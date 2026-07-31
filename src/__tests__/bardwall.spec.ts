// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  BARDWALL_STORAGE_KEY,
  calculateBardwallPay,
  getBardwallDateKey,
  getBardwallPassages,
  loadBardwallState,
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
    })
  })
})
