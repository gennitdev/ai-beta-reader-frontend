export const BUILT_IN_REVIEW_PROFILE_IDS = new Set([
  'system:fanficnet',
  'system:editorial',
  'system:line-notes',
])

export function isBuiltInReviewProfileId(value: string): boolean {
  return BUILT_IN_REVIEW_PROFILE_IDS.has(value)
}
