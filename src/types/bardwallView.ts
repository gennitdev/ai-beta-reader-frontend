// Shared view-model types for BardwallView and its extracted screen components.

import type { BardwallPassage } from '@/lib/bardwall'

/** A single revision passage the bard can offer, tagged with a stable id. */
export interface RewardPassage extends BardwallPassage {
  id: string
}

/** A saved chapter revision presented as a tellable offering. */
export interface RevisionOffering {
  id: string
  bookTitle: string
  chapterTitle: string
  createdAt: string
  passages: RewardPassage[]
  wordCount: number
}

/** The current screen of the Bardwall game state machine. */
export type BardwallScreen =
  | 'gate'
  | 'goal'
  | 'town'
  | 'amphitheater'
  | 'reward'
  | 'market'
  | 'night'
  | 'morning'
  | 'inn'
  | 'shrine'
  | 'apothecary'
  | 'camp'
  | 'challenge'
  | 'cave'
  | 'last-word'
  | 'wyrm'
