import type { BardwallChallengeCardId, BardwallPotionId } from '@/lib/bardwall'

// Eagerly import every Bardwall illustration so Vite fingerprints and bundles them.
// Keys are the source paths; we re-key them by file basename (without extension).
const mapModules = import.meta.glob('../assets/illustrations/*.webp', { eager: true, import: 'default' })
const cardModules = import.meta.glob('../assets/illustrations/cards/*.webp', { eager: true, import: 'default' })
const placeModules = import.meta.glob('../assets/illustrations/places/*.webp', { eager: true, import: 'default' })
const potionModules = import.meta.glob('../assets/illustrations/potions/*.webp', { eager: true, import: 'default' })

const byBasename = (modules: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(modules).map(([path, url]) => [
      path.split('/').pop()!.replace(/\.webp$/, ''),
      url as string,
    ]),
  )

const mapImages = byBasename(mapModules)
const cardImages = byBasename(cardModules)
const placeImages = byBasename(placeModules)
const potionImages = byBasename(potionModules)

export const bardwallMapImage = mapImages.bardwall_map
export const bardwallCardBackImage = cardImages.card_back

// Challenge card id → illustration file basename.
const CARD_IMAGE_BASENAMES: Record<BardwallChallengeCardId, string> = {
  'first-light': 'the_first_light',
  'closed-gate': 'the_closed_gate',
  'last-ember': 'the_last_ember',
  'two-cups': 'the_two_cups',
  'empty-throne': 'the_empty_throne',
  moth: 'the_moth',
  'long-dusk': 'the_long_dusk',
  ferryman: 'the_ferryman',
  'root-stone': 'the_root_beneath_stone',
  'unfinished-banner': 'the_unfinished_banner',
  'winter-wolf': 'the_winter_wolf',
  'broken-bell': 'the_broken_bell',
  'garden-wall': 'the_garden_wall',
  'falling-star': 'the_falling_star',
  'mirror-road': 'the_mirror_road',
  'lantern-given-away': 'the_lantern_given_away',
  'cave-of-eyes': 'the_cave_of_eyes',
  'turning-wheel': 'the_turning_wheel',
}

// Wyrm potion id → illustration file basename.
const POTION_IMAGE_BASENAMES: Record<BardwallPotionId, string> = {
  gold: 'golden_potion',
  blue: 'blue_potion',
  red: 'red_potion',
  silver: 'silver_potion',
  clear: 'clear_potion',
}

// Map location / screen key → scene illustration file basename.
const PLACE_IMAGE_BASENAMES = {
  inn: 'the_crooked_lantern_bedroom',
  shrine: 'the_shrine',
  'shrine-map': 'receiving_a_map_at_the_shrine',
  apothecary: 'apothecary',
  market: 'night_market',
  challenge: 'ink_and_ember',
  amphitheater: 'amphitheater',
  camp: 'forest_camp',
  cave: 'cave_entrance',
  vesper: 'vesper_deep_cavern',
  wyrm: 'the_potion_game',
} as const

export type BardwallPlaceKey = keyof typeof PLACE_IMAGE_BASENAMES

export const getBardwallCardImage = (cardId: BardwallChallengeCardId): string =>
  cardImages[CARD_IMAGE_BASENAMES[cardId]]

export const getBardwallPotionImage = (potionId: BardwallPotionId): string =>
  potionImages[POTION_IMAGE_BASENAMES[potionId]]

export const getBardwallPlaceImage = (place: BardwallPlaceKey): string =>
  placeImages[PLACE_IMAGE_BASENAMES[place]]
