import { describe, expect, it } from 'vitest'
import { BUNDLE_STRESS_SCALES, generateBundleStressFixture } from './libraryBundleFixture'

describe('large-library stress fixture generator', () => {
  it('is deterministic and keeps generated binary fixtures out of Git', async () => {
    const first = await generateBundleStressFixture('smoke', 132)
    const second = await generateBundleStressFixture('smoke', 132)

    expect(first).toEqual(second)
    expect(first.model.chapters).toHaveLength(
      BUNDLE_STRESS_SCALES.smoke.books * BUNDLE_STRESS_SCALES.smoke.chaptersPerBook,
    )
    expect(first.binaryBytes).toBe(
      BUNDLE_STRESS_SCALES.smoke.assetCount * BUNDLE_STRESS_SCALES.smoke.assetBytes,
    )
    expect(first.model.chapter_revisions).toHaveLength(
      first.model.chapters.length * BUNDLE_STRESS_SCALES.smoke.revisionsPerChapter,
    )
  })

  it('changes deterministic binary content when the seed changes', async () => {
    const first = await generateBundleStressFixture('smoke', 1)
    const second = await generateBundleStressFixture('smoke', 2)
    expect(first.model.assets[0].sha256).not.toBe(second.model.assets[0].sha256)
  })

  it('keeps the nightly scale representative of large illustrated libraries', () => {
    expect(BUNDLE_STRESS_SCALES.nightly.assetCount * BUNDLE_STRESS_SCALES.nightly.assetBytes)
      .toBeGreaterThanOrEqual(150 * 1024 * 1024)
  })
})
