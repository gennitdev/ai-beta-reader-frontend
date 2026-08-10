import { describe, expect, it } from 'vitest'
import { getPrimaryNavItems } from '@/config/navigation'

describe('primary navigation', () => {
  it('includes Bardwall by default', () => {
    expect(getPrimaryNavItems().map((item) => item.to)).toContain('/bardwall')
  })

  it('hides only the Bardwall link when the feature is disabled', () => {
    const defaultPaths = getPrimaryNavItems().map((item) => item.to)
    const hiddenPaths = getPrimaryNavItems(false).map((item) => item.to)

    expect(hiddenPaths).toEqual(defaultPaths.filter((path) => path !== '/bardwall'))
  })
})
