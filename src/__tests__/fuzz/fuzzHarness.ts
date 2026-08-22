import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import * as fc from 'fast-check'

const DEFAULT_SEED = 132_202_608
const DEFAULT_RUNS = 250

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export const fuzzParameters = Object.freeze({
  seed: positiveInteger(process.env.BUNDLE_FUZZ_SEED, DEFAULT_SEED),
  numRuns: positiveInteger(process.env.BUNDLE_FUZZ_RUNS, DEFAULT_RUNS),
  endOnFailure: true,
})

export function checkFuzzProperty<Ts extends [unknown, ...unknown[]]>(
  name: string,
  property: fc.IProperty<Ts>,
): void {
  const result = fc.check(property, fuzzParameters)
  if (!result.failed) return

  const artifactPath = resolve('test-results/fuzz', `${name.replace(/[^a-z0-9_-]+/gi, '-')}.json`)
  mkdirSync(dirname(artifactPath), { recursive: true })
  writeFileSync(artifactPath, `${JSON.stringify({
    property: name,
    seed: result.seed,
    counterexamplePath: result.counterexamplePath,
    counterexample: result.counterexample,
    error: result.error,
  }, null, 2)}\n`)

  throw new Error(
    `Fuzz property ${name} failed. Replay with BUNDLE_FUZZ_SEED=${result.seed} `
    + `and path ${result.counterexamplePath}. Counterexample saved to ${artifactPath}.`,
    { cause: result.errorInstance },
  )
}
