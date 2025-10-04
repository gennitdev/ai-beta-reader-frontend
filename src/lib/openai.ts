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
  isFirstChapter: boolean = false
): Promise<{
  summary: string
  pov: string | null
  characters: string[]
  beats: string[]
  spoilers_ok: boolean
}> {
  const client = createOpenAIClient(apiKey)

  // Use same system prompt as Express backend
  const systemPrompt = `You are an expert fiction editor. Produce a tight factual summary (150–250 words), include POV, main characters, and 4–8 bullet beats. No speculation. Return valid JSON only.${isFirstChapter ? ' IMPORTANT: This is the FIRST chapter of the book - there are no previous chapters to reference. Focus only on what happens in this opening chapter.' : ''}`

  const userPrompt = `Book: ${bookTitle} (${bookId})
Chapter: ${chapterId}${chapterTitle ? ` — ${chapterTitle}` : ''}${isFirstChapter ? ' (FIRST CHAPTER)' : ''}

${isFirstChapter ? 'This is the opening chapter of the book. Summarize only what happens in this first chapter. Do not reference any previous events or chapters.\n\n' : ''}Return JSON only for this schema: {pov, characters[], beats[], spoilers_ok, summary}

${chapterText}`

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
  priorChapterSummaries?: string
): Promise<{
  reviewText: string
  promptUsed: string
}> {
  const client = createOpenAIClient(apiKey)

  // Build user prompt similar to Express backend
  const priorSummariesText = priorChapterSummaries || 'No prior chapters.'

  const userPrompt = `PRIOR CHAPTER SUMMARIES:\n${priorSummariesText}\n\n` +
    `NEW CHAPTER: ${chapterId}${chapterTitle ? ` — ${chapterTitle}` : ''}\n${chapterText}\n\n` +
    'Write the review now.'

  // Store the full prompt for transparency (matches Express backend)
  const fullPrompt = `SYSTEM PROMPT:\n${profile.system_prompt}\n\nUSER PROMPT:\n${userPrompt}`

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: profile.system_prompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7
  })

  const reviewText = response.choices[0]?.message?.content || ''

  return {
    reviewText,
    promptUsed: fullPrompt
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
