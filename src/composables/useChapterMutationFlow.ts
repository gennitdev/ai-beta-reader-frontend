import { ref } from 'vue'
import type { Ref } from 'vue'
import { BUILT_IN_PROFILES, generateChapterSummary, generateReview as generateAIReview, type AIProfile, type PartSummaryChapterInput, type PartSummaryOverview } from '@/lib/openai'
import type { BookPart } from '@/lib/database'

export interface ChapterMutationChapter {
  id: string
  book_id: string
  title: string | null
  text: string
  summary: string | null
  pov: string | null
  characters: string[] | null
  beats: string[] | null
  spoilers_ok: boolean | null
  notes: string | null
  part_id: string | null
}

export interface ChapterMutationCustomProfile {
  id: number
  name: string
  description: string
}

export interface WikiUpdateResult {
  entityName: string
  entityType: 'character' | 'location' | 'concept' | 'other'
  wikiPageId: string
  updateType: 'created' | 'updated' | 'unchanged'
}

interface ChapterMutationFlowOptions {
  chapter: Ref<ChapterMutationChapter | null>
  bookId: Ref<string>
  currentBookTitle: () => string
  currentBookChapterOrder: () => string[]
  currentPart: Ref<BookPart | null>
  currentPartNumber: Ref<number | null>
  reviewTone: Ref<string>
  customProfiles: Ref<ChapterMutationCustomProfile[]>
  editedSummary: Ref<string>
  editedNotes: Ref<string>
  normalizeCharacterList: (value: unknown) => string[]
  buildPriorPartSummaries: (currentPartId: string | null) => Promise<PartSummaryOverview[]>
  buildPriorChapterSummariesInPart: (part: BookPart | null, currentChapterId: string) => Promise<PartSummaryChapterInput[]>
  buildPriorChapterSummariesInBook: (currentChapterId: string) => Promise<PartSummaryChapterInput[]>
  invalidateChapterSummary: (chapterId: string) => void
  saveSummaryToDb: (summary: {
    chapter_id: string
    summary: string
    pov: string | null
    characters: string[]
    beats: string[]
    spoilers_ok: boolean
  }) => Promise<void>
  saveNotesToDb: (chapterId: string, notes: string) => Promise<void>
  saveReviewToDb: (review: {
    chapter_id: string
    review_text: string
    prompt_used: string | null
    profile_id: number | null
    profile_name: string | null
    tone_key: string | null
  }) => Promise<void>
  createWikiPage: (page: {
    book_id: string
    page_name: string
    content: string
    summary: string
    page_type?: string
    created_by_ai?: boolean
  }) => Promise<string>
  updateWikiPage: (pageId: string, updates: {
    content?: string
    summary?: string
  }) => Promise<void>
  getWikiPage: (bookId: string, pageName: string) => Promise<{ id: string; content: string | null; summary: string | null } | null>
  trackWikiUpdate: (update: {
    wiki_page_id: string
    chapter_id: string
    update_type: string
    change_summary?: string
    contradiction_notes?: string
  }) => Promise<void>
  addChapterWikiMention: (
    chapterId: string,
    wikiPageId: string,
    linkSource?: 'ai_summary' | 'manual',
  ) => Promise<void>
  reloadWikiLinks: () => Promise<void>
  reloadCharacters: () => Promise<void>
  reloadReviews: () => Promise<void>
  openSettings: () => void
}

export function useChapterMutationFlow(options: ChapterMutationFlowOptions) {
  const generatingReview = ref(false)
  const generatingSummary = ref(false)
  const savingSummary = ref(false)
  const savingNotes = ref(false)
  const summaryProgress = ref('')
  const summaryError = ref<string | null>(null)
  const wikiUpdateResults = ref<WikiUpdateResult[]>([])
  const showWikiUpdateResults = ref(false)

  const updateWikiFromGeneratedSummary = async (
    apiKey: string,
    chapterSummary: string,
    generatedCharacters: string[],
    generatedLocations: string[],
  ): Promise<WikiUpdateResult[]> => {
    const currentChapter = options.chapter.value
    if (!currentChapter) return []

    const wikiResults: WikiUpdateResult[] = []
    const totalEntities = generatedCharacters.length + generatedLocations.length

    const processWikiEntity = async (
      entityName: string,
      entityType: 'character' | 'location',
      currentIndex: number,
    ) => {
      summaryProgress.value = `Updating wiki: ${entityName} (${currentIndex + 1} of ${totalEntities})...`

      try {
        const existingPage = await options.getWikiPage(options.bookId.value, entityName)
        const { generateWikiContent } = await import('@/lib/openai')
        const wikiResult = await generateWikiContent(
          apiKey,
          entityName,
          currentChapter.text,
          chapterSummary,
          existingPage?.content || null,
          entityType,
        )

        if (existingPage) {
          if (wikiResult.hasChanges) {
            await options.updateWikiPage(existingPage.id, {
              content: wikiResult.content,
              summary: wikiResult.summary,
            })
            await options.trackWikiUpdate({
              wiki_page_id: existingPage.id,
              chapter_id: currentChapter.id,
              update_type: wikiResult.hasContradictions ? 'update_with_contradictions' : 'update',
              change_summary: wikiResult.changeSummary,
              contradiction_notes: wikiResult.contradictions,
            })
            wikiResults.push({
              entityName,
              entityType,
              wikiPageId: existingPage.id,
              updateType: 'updated',
            })
          } else {
            wikiResults.push({
              entityName,
              entityType,
              wikiPageId: existingPage.id,
              updateType: 'unchanged',
            })
          }
          await options.addChapterWikiMention(currentChapter.id, existingPage.id, 'ai_summary')
        } else {
          const newPageId = await options.createWikiPage({
            book_id: options.bookId.value,
            page_name: entityName,
            content: wikiResult.content,
            summary: wikiResult.summary,
            page_type: entityType,
            created_by_ai: true,
          })
          await options.trackWikiUpdate({
            wiki_page_id: newPageId,
            chapter_id: currentChapter.id,
            update_type: 'created',
            change_summary: `Created ${entityType} page for ${entityName}`,
          })
          await options.addChapterWikiMention(currentChapter.id, newPageId, 'ai_summary')
          wikiResults.push({
            entityName,
            entityType,
            wikiPageId: newPageId,
            updateType: 'created',
          })
        }
      } catch (wikiError) {
        console.error(`Failed to update wiki for ${entityName}:`, wikiError)
      }
    }

    for (let i = 0; i < generatedCharacters.length; i++) {
      await processWikiEntity(generatedCharacters[i], 'character', i)
    }

    for (let i = 0; i < generatedLocations.length; i++) {
      await processWikiEntity(generatedLocations[i], 'location', generatedCharacters.length + i)
    }

    return wikiResults
  }

  const saveSummary = async () => {
    if (!options.chapter.value) return false

    try {
      savingSummary.value = true
      await options.saveSummaryToDb({
        chapter_id: options.chapter.value.id,
        summary: options.editedSummary.value,
        pov: options.chapter.value.pov,
        characters: options.chapter.value.characters || [],
        beats: options.chapter.value.beats || [],
        spoilers_ok: options.chapter.value.spoilers_ok || false,
      })
      options.chapter.value.summary = options.editedSummary.value
      return true
    } catch (error) {
      console.error('Failed to save summary:', error)
      alert('Failed to save summary')
      return false
    } finally {
      savingSummary.value = false
    }
  }

  const saveNotes = async () => {
    if (!options.chapter.value) return false

    try {
      savingNotes.value = true
      await options.saveNotesToDb(options.chapter.value.id, options.editedNotes.value)
      options.chapter.value.notes = options.editedNotes.value
      return true
    } catch (error) {
      console.error('Failed to save notes:', error)
      alert('Failed to save notes')
      return false
    } finally {
      savingNotes.value = false
    }
  }

  const generateSummary = async (updateWikiOnSummary: boolean) => {
    const chapter = options.chapter.value
    if (!chapter) return

    summaryProgress.value = ''
    summaryError.value = null
    wikiUpdateResults.value = []
    showWikiUpdateResults.value = false

    try {
      generatingSummary.value = true

      const apiKey = localStorage.getItem('openai_api_key')
      if (!apiKey) {
        alert('Please add your OpenAI API key in Settings first')
        options.openSettings()
        return
      }

      summaryProgress.value = 'Building context from previous chapters...'
      const chapterOrder = options.currentBookChapterOrder()
      const isFirstChapter = chapterOrder[0] === chapter.id

      const priorPartSummaries = await options.buildPriorPartSummaries(chapter.part_id ?? null)
      const priorChapterSummaries = await options.buildPriorChapterSummariesInPart(
        options.currentPart.value,
        chapter.id,
      )

      summaryProgress.value = 'Generating chapter summary...'
      const result = await generateChapterSummary(
        apiKey,
        chapter.text,
        chapter.title || chapter.id,
        chapter.id,
        options.bookId.value,
        options.currentBookTitle(),
        isFirstChapter,
        {
          partName: options.currentPart.value?.name ?? null,
          partNumber: options.currentPartNumber.value,
          priorPartSummaries,
          priorChapterSummaries,
        },
      )

      const generatedCharacters = options.normalizeCharacterList(result.characters)
      const beatsArray = Array.isArray(result.beats) ? result.beats : []

      summaryProgress.value = 'Saving summary...'
      await options.saveSummaryToDb({
        chapter_id: chapter.id,
        summary: result.summary,
        pov: result.pov,
        characters: generatedCharacters,
        beats: beatsArray,
        spoilers_ok: result.spoilers_ok,
      })
      options.invalidateChapterSummary(chapter.id)

      chapter.summary = result.summary
      chapter.pov = result.pov
      chapter.characters = generatedCharacters.length ? generatedCharacters : null
      chapter.beats = beatsArray.length ? beatsArray : null
      chapter.spoilers_ok = result.spoilers_ok
      options.editedSummary.value = result.summary

      if (updateWikiOnSummary) {
        const wikiResults = await updateWikiFromGeneratedSummary(
          apiKey,
          result.summary,
          generatedCharacters,
          Array.isArray(result.locations) ? result.locations : [],
        )
        wikiUpdateResults.value = wikiResults
        if (wikiResults.length > 0) {
          showWikiUpdateResults.value = true
        }
        await options.reloadWikiLinks()
      }

      summaryProgress.value = 'Finishing up...'
      if (updateWikiOnSummary) {
        await options.reloadCharacters()
      }
      summaryProgress.value = ''
    } catch (error: unknown) {
      console.error('Failed to generate summary:', error)
      summaryError.value = error instanceof Error ? error.message : 'Unknown error occurred'
      summaryProgress.value = ''
    } finally {
      generatingSummary.value = false
    }
  }

  const generateReview = async () => {
    const chapter = options.chapter.value
    if (!chapter) return

    try {
      generatingReview.value = true

      const apiKey = localStorage.getItem('openai_api_key')
      if (!apiKey) {
        alert('Please add your OpenAI API key in Settings first')
        options.openSettings()
        return
      }

      let profile: AIProfile
      let isCustomProfile = false
      let customProfileId: number | null = null
      let profileName = ''

      if (options.reviewTone.value.startsWith('custom-')) {
        isCustomProfile = true
        customProfileId = parseInt(options.reviewTone.value.replace('custom-', ''))
        const customProfile = options.customProfiles.value.find((entry) => entry.id === customProfileId)
        if (!customProfile) {
          alert('Selected custom profile not found')
          return
        }
        profileName = customProfile.name
        profile = {
          id: `custom-${customProfileId}`,
          name: customProfile.name,
          tone_key: `custom-${customProfileId}`,
          system_prompt: `You are a beta reader with this personality and approach: ${customProfile.description}. Please review the following chapter providing feedback in this style.`,
          is_system: false,
        }
      } else {
        const builtInProfile = BUILT_IN_PROFILES[options.reviewTone.value as keyof typeof BUILT_IN_PROFILES]
        if (!builtInProfile) {
          alert('Selected profile not found')
          return
        }
        profileName = builtInProfile.name
        profile = builtInProfile
      }

      const priorPartSummaries = await options.buildPriorPartSummaries(chapter.part_id ?? null)
      let currentPartChapterSummaries = await options.buildPriorChapterSummariesInPart(
        options.currentPart.value,
        chapter.id,
      )

      if (!chapter.part_id) {
        currentPartChapterSummaries = await options.buildPriorChapterSummariesInBook(chapter.id)
      }

      const result = await generateAIReview(
        apiKey,
        chapter.text,
        chapter.title || chapter.id,
        chapter.id,
        profile,
        {
          priorPartSummaries,
          currentPartChapterSummaries,
        },
      )

      await options.saveReviewToDb({
        chapter_id: chapter.id,
        review_text: result.reviewText,
        prompt_used: result.promptUsed,
        profile_id: isCustomProfile ? customProfileId : null,
        profile_name: profileName,
        tone_key: options.reviewTone.value,
      })

      await options.reloadReviews()
    } catch (error: unknown) {
      console.error('Failed to generate review:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to generate review: ${message}`)
    } finally {
      generatingReview.value = false
    }
  }

  return {
    generatingReview,
    generatingSummary,
    savingSummary,
    savingNotes,
    summaryProgress,
    summaryError,
    wikiUpdateResults,
    showWikiUpdateResults,
    saveSummary,
    saveNotes,
    generateSummary,
    generateReview,
  }
}
