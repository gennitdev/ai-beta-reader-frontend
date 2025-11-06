import OpenAI from 'openai'

/**
 * Create OpenAI client for client-side API calls
 * Compatible with the Express backend's OpenAI implementation
 *
 * @param apiKey - User's OpenAI API key
 * @returns Configured OpenAI client
 */
export function createOpenAIClient(apiKey: string): OpenAI {
  if (!apiKey) {
    throw new Error('OpenAI API key is required')
  }

  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true // Required for client-side usage
  })
}

/**
 * Generate a chapter summary with structured metadata
 * Compatible with Express backend's chapter summary format
 */
export async function generateChapterSummary(
  apiKey: string,
  chapterText: string,
  chapterTitle: string,
  chapterId: string,
  bookId: string,
  bookTitle: string,
  isFirstChapter: boolean = false,
  context: ChapterSummaryContext = {}
): Promise<{
  summary: string
  pov: string | null
  characters: string[]
  beats: string[]
  spoilers_ok: boolean
}> {
  const client = createOpenAIClient(apiKey)

  // Use same system prompt as Express backend
  const systemPrompt = `You are an expert fiction editor. Produce a tight factual summary (150–250 words), include POV, main characters, and 4–8 bullet beats. No speculation. Return valid JSON only.${
    isFirstChapter
      ? ' IMPORTANT: This is the FIRST chapter of the book - there are no previous chapters to reference. Focus only on what happens in this opening chapter.'
      : ''
  }`

  const contextSections: string[] = []

  if (context.priorPartSummaries?.length) {
    const priorPartsText = context.priorPartSummaries
      .map((entry) => {
        const partLabel =
          entry.partNumber != null
            ? `Part ${entry.partNumber}${
                entry.partTitle ? ` — ${entry.partTitle}` : ''
              }`
            : entry.partTitle || entry.partId
        return `${partLabel}\n${entry.summary}`
      })
      .join('\n\n')
    contextSections.push(`PREVIOUS PART OVERVIEWS:\n${priorPartsText}`)
  }

  if (context.priorChapterSummaries?.length) {
    const priorChaptersText = context.priorChapterSummaries
      .map(
        (chapter, index) =>
          `${index + 1}. ${chapter.title} (${chapter.id})\n${chapter.summary}`,
      )
      .join('\n\n')
    contextSections.push(`EARLIER CHAPTERS IN THIS PART:\n${priorChaptersText}`)
  }

  const partLine =
    context.partName != null
      ? `Part: ${context.partName}${
          context.partNumber ? ` (Part ${context.partNumber})` : ''
        }`
      : null

  const userPromptLines = [
    `Book: ${bookTitle} (${bookId})`,
    partLine,
    `Chapter: ${chapterId}${chapterTitle ? ` — ${chapterTitle}` : ''}${
      isFirstChapter ? ' (FIRST CHAPTER)' : ''
    }`,
  ].filter(Boolean)

  if (contextSections.length) {
    userPromptLines.push(contextSections.join('\n\n'))
  }

  if (isFirstChapter) {
    userPromptLines.push(
      'This is the opening chapter of the book. Summarize only what happens in this first chapter. Do not reference any previous events or chapters.',
    )
  }

  userPromptLines.push(
    'Return JSON only for this schema: {pov, characters[], beats[], spoilers_ok, summary}',
  )
  userPromptLines.push(chapterText)

  const userPrompt = userPromptLines.join('\n\n')

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  const parsed = JSON.parse(content)
  return {
    summary: parsed.summary || '',
    pov: parsed.pov || null,
    characters: parsed.characters || [],
    beats: parsed.beats || [],
    spoilers_ok: !!parsed.spoilers_ok
  }
}

export interface PartSummaryChapterInput {
  id: string
  title: string
  summary: string
}

export interface PartSummaryOverview {
  partId: string
  partTitle: string
  summary: string
  partNumber?: number | null
}

export interface ChapterSummaryContext {
  partName?: string | null
  partNumber?: number | null
  priorPartSummaries?: PartSummaryOverview[]
  priorChapterSummaries?: PartSummaryChapterInput[]
}

export interface ReviewContext {
  priorPartSummaries?: PartSummaryOverview[]
  currentPartChapterSummaries?: PartSummaryChapterInput[]
}

/**
 * Generate a higher-level summary for a part using existing chapter summaries
 */
export async function generatePartSummary(
  apiKey: string,
  bookTitle: string,
  partTitle: string,
  partId: string,
  chapters: PartSummaryChapterInput[],
  partNumber?: number
): Promise<{
  summary: string
  characters: string[]
  beats: string[]
}> {
  const client = createOpenAIClient(apiKey)

  if (!chapters.length) {
    throw new Error('At least one chapter summary is required to generate a part summary')
  }

  const chapterSummaryText = chapters
    .map(
      (chapter, index) =>
        `### ${index + 1}. ${chapter.title} (${chapter.id})\n${chapter.summary}`,
    )
    .join('\n\n')

  const systemPrompt =
    'You are an expert fiction editor summarizing a multi-chapter story arc. Produce a cohesive summary (250–400 words) covering the major plot developments, character arcs, conflicts, and resolutions in this part. Avoid scene-level detail, focusing on narrative flow and stakes. Include key characters and 4–6 essential beats. Return valid JSON only.'

  const partLabel = partNumber ? `Part ${partNumber}` : 'This part'
  const userPrompt = `Book: ${bookTitle}
Part: ${partId} — ${partTitle}

${partLabel} contains the following chapter summaries:

${chapterSummaryText}

Return JSON only for this schema: {summary, characters[], beats[]}`

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  const parsed = JSON.parse(content)
  return {
    summary: parsed.summary || '',
    characters: parsed.characters || [],
    beats: parsed.beats || [],
  }
}

/**
 * Built-in AI reviewer profiles matching Express backend
 * These correspond to the ai_profiles table tone_key values
 */
export const BUILT_IN_PROFILES = {
  fanficnet: {
    id: 'fanficnet',
    name: 'Fan Reader',
    tone_key: 'fanficnet',
    description: 'Enthusiastic fanfiction.net style review',
    system_prompt: `You are an enthusiastic fanfiction reader leaving a review. You're excited about the story and provide encouraging feedback.

Your review style:
- Start with what you loved
- Point out favorite moments or lines
- Ask questions about what might happen next
- Offer constructive suggestions gently
- End on an encouraging note
- Use casual, friendly language
- Show genuine excitement for the story

Be specific about what worked and what could be improved, but always maintain an encouraging tone.`,
    is_system: true
  },
  editorial: {
    id: 'editorial',
    name: 'Developmental Editor',
    tone_key: 'editorial',
    description: 'Professional developmental editor feedback',
    system_prompt: `You are a professional developmental editor providing chapter-level feedback.

Focus on:
- Pacing and structure
- Character development and consistency
- Plot progression and tension
- Emotional beats and reader engagement
- Scene transitions
- Narrative arc within the chapter

Provide:
- What's working well (be specific)
- Areas for improvement (with concrete suggestions)
- Questions to consider for revision
- Overall assessment of the chapter's effectiveness

Be constructive, professional, and specific. Focus on big-picture storytelling elements rather than line-level details.`,
    is_system: true
  },
  'line-notes': {
    id: 'line-notes',
    name: 'Line Editor',
    tone_key: 'line-notes',
    description: 'Detailed line-by-line editing suggestions',
    system_prompt: `You are a line editor providing detailed, specific feedback on prose and craft.

Focus on:
- Sentence-level clarity and flow
- Word choice and precision
- Show vs. tell
- Dialogue effectiveness
- Sensory details and imagery
- Repetition or awkward phrasing
- Prose rhythm and variety

Provide:
- Specific examples from the text (quote short phrases)
- Concrete suggestions for improvement
- Patterns you notice (good or bad)
- Line-level craft observations

Be specific and quote examples. Focus on the craft of writing at the sentence and paragraph level.`,
    is_system: true
  }
} as const

export type BuiltInProfileKey = keyof typeof BUILT_IN_PROFILES

export interface AIProfile {
  id: string
  name: string
  tone_key: string
  system_prompt: string
  is_system: boolean
  is_default?: boolean
}

/**
 * Generate an AI review of a chapter
 * Compatible with Express backend's review generation
 */
export async function generateReview(
  apiKey: string,
  chapterText: string,
  chapterTitle: string,
  chapterId: string,
  profile: AIProfile,
  context: ReviewContext = {}
): Promise<{
  reviewText: string
  promptUsed: string
}> {
  const client = createOpenAIClient(apiKey)

  const contextSections: string[] = []

  if (context.priorPartSummaries?.length) {
    const priorParts = context.priorPartSummaries
      .map((entry) => {
        const partLabel =
          entry.partNumber != null
            ? `Part ${entry.partNumber}${
                entry.partTitle ? ` — ${entry.partTitle}` : ''
              }`
            : entry.partTitle || entry.partId
        return `${partLabel}\n${entry.summary}`
      })
      .join('\n\n')
    contextSections.push(`PREVIOUS PART SUMMARIES:\n${priorParts}`)
  }

  if (context.currentPartChapterSummaries?.length) {
    const currentPart = context.currentPartChapterSummaries
      .map(
        (entry, index) =>
          `${index + 1}. ${entry.title} (${entry.id})\n${entry.summary}`,
      )
      .join('\n\n')
    contextSections.push(`CURRENT PART CONTEXT:\n${currentPart}`)
  }

  const priorSummariesText = contextSections.length
    ? contextSections.join('\n\n')
    : 'No prior story context.'

  const userPrompt =
    `PRIOR STORY CONTEXT:\n${priorSummariesText}\n\n` +
    `NEW CHAPTER: ${chapterId}${chapterTitle ? ` — ${chapterTitle}` : ''}\n${chapterText}\n\n` +
    'Write the review now.'

  const fullPrompt = `SYSTEM PROMPT:\n${profile.system_prompt}\n\nUSER PROMPT:\n${userPrompt}`

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: profile.system_prompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
  })

  const reviewText = response.choices[0]?.message?.content || ''

  return {
    reviewText,
    promptUsed: fullPrompt,
  }
}

/**
 * Get AI profile by tone key
 */
export function getProfileByToneKey(toneKey: string, customProfiles: AIProfile[] = []): AIProfile | null {
  // Check custom profiles first
  const customProfile = customProfiles.find(p => p.tone_key === toneKey)
  if (customProfile) return customProfile

  // Check built-in profiles
  if (toneKey in BUILT_IN_PROFILES) {
    return BUILT_IN_PROFILES[toneKey as BuiltInProfileKey]
  }

  return null
}

/**
 * Update wiki pages from chapter summary
 * Creates new wiki pages for characters that don't exist,
 * and updates existing ones with new information
 */
export async function updateWikiPagesFromChapter(
  apiKey: string,
  bookId: string,
  chapterId: string,
  chapterText: string,
  chapterSummary: string,
  characters: string[],
  getWikiPageFn: (bookId: string, pageName: string) => Promise<any | null>,
  createWikiPageFn: (page: {
    book_id: string;
    page_name: string;
    content: string;
    summary: string;
    page_type?: string;
    created_by_ai?: boolean;
  }) => Promise<string>,
  updateWikiPageFn: (pageId: string, updates: {
    content?: string;
    summary?: string;
  }) => Promise<void>,
  trackWikiUpdateFn: (update: {
    wiki_page_id: string;
    chapter_id: string;
    update_type: string;
    change_summary?: string;
    contradiction_notes?: string;
  }) => Promise<void>,
  addChapterWikiMentionFn: (chapterId: string, wikiPageId: string) => Promise<void>
): Promise<void> {
  // Process each character mentioned in the chapter
  for (const characterName of characters) {
    try {
      // Check if wiki page exists
      const existingPage = await getWikiPageFn(bookId, characterName)

      // Generate wiki content (create new or update existing)
      const wikiResult = await generateWikiContent(
        apiKey,
        characterName,
        chapterText,
        chapterSummary,
        existingPage?.content || null
      )

      if (existingPage) {
        // Update existing page
        if (wikiResult.hasChanges) {
          await updateWikiPageFn(existingPage.id, {
            content: wikiResult.content,
            summary: wikiResult.summary
          })

          // Track the update
          await trackWikiUpdateFn({
            wiki_page_id: existingPage.id,
            chapter_id: chapterId,
            update_type: wikiResult.hasContradictions ? 'update_with_contradictions' : 'update',
            change_summary: wikiResult.changeSummary,
            contradiction_notes: wikiResult.contradictions
          })
        }

        // Add chapter-wiki mention
        await addChapterWikiMentionFn(chapterId, existingPage.id)
      } else {
        // Create new page
        const newPageId = await createWikiPageFn({
          book_id: bookId,
          page_name: characterName,
          content: wikiResult.content,
          summary: wikiResult.summary,
          page_type: 'character',
          created_by_ai: true
        })

        // Track the creation
        await trackWikiUpdateFn({
          wiki_page_id: newPageId,
          chapter_id: chapterId,
          update_type: 'created',
          change_summary: `Created character page for ${characterName}`
        })

        // Add chapter-wiki mention
        await addChapterWikiMentionFn(chapterId, newPageId)
      }
    } catch (error) {
      console.error(`Failed to update wiki for ${characterName}:`, error)
      // Continue with other characters even if one fails
    }
  }
}

/**
 * Generate or update wiki page content for a character
 */
export async function generateWikiContent(
  apiKey: string,
  characterName: string,
  chapterText: string,
  chapterSummary: string,
  existingContent: string | null
): Promise<{
  content: string
  summary: string
  hasChanges: boolean
  changeSummary?: string
  hasContradictions?: boolean
  contradictions?: string
}> {
  const client = createOpenAIClient(apiKey)
  const isNewPage = !existingContent

  const systemPrompt = isNewPage
    ? `You are a wiki editor creating a character page. Create a comprehensive character profile based on the information provided. Return JSON with: {content: "markdown content", summary: "brief summary", hasChanges: true}`
    : `You are a wiki editor updating a character page. Compare the existing content with new information from the chapter. Update the wiki to include new information and note any contradictions. Return JSON with: {content: "updated markdown", summary: "updated summary", hasChanges: boolean, changeSummary: "what changed", hasContradictions: boolean, contradictions: "contradictions found"}`

  const userPrompt = isNewPage
    ? `Create a wiki page for character: ${characterName}

Chapter Summary: ${chapterSummary}

Chapter Text Context: ${chapterText.substring(0, 2000)}...

Create a character profile with sections for:
- Basic Information
- Appearance
- Personality
- Background
- Relationships
- Chapter Appearances`
    : `Update the wiki page for character: ${characterName}

EXISTING WIKI CONTENT:
${existingContent}

NEW CHAPTER INFORMATION:
Chapter Summary: ${chapterSummary}
Chapter Text Context: ${chapterText.substring(0, 2000)}...

Update the wiki with any new information. If there are contradictions with existing content, note them clearly in a "Contradictions" section.`

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content received from OpenAI for wiki generation')
    }

    return JSON.parse(content)
  } catch (error) {
    console.error('Error generating wiki content:', error)
    // Return a basic fallback
    return {
      content: `# ${characterName}\n\nMentioned in chapter summary: ${chapterSummary}`,
      summary: `Character from the story`,
      hasChanges: true,
      changeSummary: 'Basic wiki page created due to AI generation error'
    }
  }
}
