import { describe, expect, it } from 'vitest'
import { calculateStrictCoverage } from './check-strict-coverage.mjs'

describe('calculateStrictCoverage', () => {
  it('counts partially covered branch lines as uncovered', () => {
    const report = `
SF:/workspace/example.ts
DA:1,1
DA:2,1
DA:3,1
DA:4,0
BRDA:2,0,0,1
BRDA:2,0,1,1
BRDA:3,0,0,1
BRDA:3,0,1,0
LF:4
LH:3
end_of_record
`

    expect(calculateStrictCoverage(report)).toMatchObject({
      total: 4,
      fullyCovered: 2,
      partiallyCovered: 1,
      missed: 2,
      percent: 50,
    })
  })

  it('aggregates files and handles an empty report', () => {
    const report = `
SF:/workspace/first.ts
DA:1,1
end_of_record
SF:/workspace/second.ts
DA:1,0
end_of_record
`

    expect(calculateStrictCoverage(report)).toMatchObject({
      total: 2,
      fullyCovered: 1,
      missed: 1,
      percent: 50,
    })
    expect(calculateStrictCoverage('')).toMatchObject({ total: 0, percent: 100 })
  })
})
