import type { z } from 'zod'
import type {
  bundleAssetSchema,
  bundleBookCharacterSchema,
  bundleBookSchema,
  bundleChapterActivitySchema,
  bundleChapterNoteSchema,
  bundleChapterRevisionSchema,
  bundleChapterSchema,
  bundleChapterSummarySchema,
  bundlePartSchema,
  bundlePartSummarySchema,
  bundleProfileSchema,
  bundleReviewSchema,
  bundleWikiPageSchema,
  bundleWikiReviewStateSchema,
  bundleWikiUpdateSchema,
  canonicalLibraryModelSchema,
  chapterWikiMentionSchema,
} from './schemas'

export type CanonicalLibraryModel = z.infer<typeof canonicalLibraryModelSchema>
export type BundleBook = z.infer<typeof bundleBookSchema>
export type BundlePart = z.infer<typeof bundlePartSchema>
export type BundleChapter = z.infer<typeof bundleChapterSchema>
export type ChapterWikiMention = z.infer<typeof chapterWikiMentionSchema>
export type BundleChapterNote = z.infer<typeof bundleChapterNoteSchema>
export type BundleChapterSummary = z.infer<typeof bundleChapterSummarySchema>
export type BundlePartSummary = z.infer<typeof bundlePartSummarySchema>
export type BundleReview = z.infer<typeof bundleReviewSchema>
export type BundleWikiPage = z.infer<typeof bundleWikiPageSchema>
export type BundleBookCharacter = z.infer<typeof bundleBookCharacterSchema>
export type BundleProfile = z.infer<typeof bundleProfileSchema>
export type BundleAsset = z.infer<typeof bundleAssetSchema>
export type BundleChapterRevision = z.infer<typeof bundleChapterRevisionSchema>
export type BundleChapterActivity = z.infer<typeof bundleChapterActivitySchema>
export type BundleWikiUpdate = z.infer<typeof bundleWikiUpdateSchema>
export type BundleWikiReviewState = z.infer<typeof bundleWikiReviewStateSchema>
