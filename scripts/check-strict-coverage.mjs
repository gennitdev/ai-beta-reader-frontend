import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function parseRecord(record) {
  const source = record.match(/^SF:(.+)$/m)?.[1]
  if (!source) return null

  const lineHits = new Map()
  const branchHits = new Map()

  for (const entry of record.split('\n')) {
    const line = entry.match(/^DA:(\d+),(\d+)/)
    if (line) {
      lineHits.set(Number(line[1]), Number(line[2]))
      continue
    }

    const branch = entry.match(/^BRDA:(\d+),[^,]*,[^,]*,([^,]+)/)
    if (!branch) continue

    const lineNumber = Number(branch[1])
    const hits = branchHits.get(lineNumber) ?? []
    hits.push(branch[2] !== '-' && Number(branch[2]) > 0)
    branchHits.set(lineNumber, hits)
  }

  let fullyCovered = 0
  let partiallyCovered = 0

  for (const [lineNumber, hits] of lineHits) {
    const branches = branchHits.get(lineNumber) ?? []
    const hasMissedBranch = branches.some((covered) => !covered)
    const hasCoveredBranch = branches.some(Boolean)

    if (hits > 0 && !hasMissedBranch) fullyCovered += 1
    if (hits > 0 && hasCoveredBranch && hasMissedBranch) partiallyCovered += 1
  }

  return {
    source,
    total: lineHits.size,
    fullyCovered,
    partiallyCovered,
  }
}

export function calculateStrictCoverage(lcov) {
  const files = lcov
    .split('end_of_record')
    .map(parseRecord)
    .filter(Boolean)
    .map((file) => ({
      ...file,
      missed: file.total - file.fullyCovered,
      percent: file.total === 0 ? 100 : (file.fullyCovered / file.total) * 100,
    }))

  const total = files.reduce((sum, file) => sum + file.total, 0)
  const fullyCovered = files.reduce((sum, file) => sum + file.fullyCovered, 0)
  const partiallyCovered = files.reduce((sum, file) => sum + file.partiallyCovered, 0)

  return {
    total,
    fullyCovered,
    partiallyCovered,
    missed: total - fullyCovered,
    percent: total === 0 ? 100 : (fullyCovered / total) * 100,
    files,
  }
}

function readOption(name, fallback) {
  const prefix = `--${name}=`
  const value = process.argv.find((argument) => argument.startsWith(prefix))
  return value ? value.slice(prefix.length) : fallback
}

function run() {
  const reportPath = path.resolve(readOption('report', 'coverage/lcov.info'))
  const minimum = Number(readOption('minimum', '0'))

  if (!Number.isFinite(minimum) || minimum < 0 || minimum > 100) {
    throw new Error('The strict coverage minimum must be a number from 0 to 100.')
  }

  const result = calculateStrictCoverage(fs.readFileSync(reportPath, 'utf8'))
  const relative = (source) => path.relative(process.cwd(), source) || source
  const hotspots = [...result.files]
    .filter((file) => file.missed > 0)
    .sort((left, right) => right.missed - left.missed)
    .slice(0, 10)

  process.stdout.write(
    `Strict line coverage: ${result.percent.toFixed(2)}% `
      + `(${result.fullyCovered}/${result.total}; ${result.partiallyCovered} partial lines count as uncovered)\n`,
  )
  process.stdout.write('Largest strict-coverage gaps:\n')
  for (const file of hotspots) {
    process.stdout.write(
      `  ${String(file.missed).padStart(4)} missed `
        + `(${file.percent.toFixed(2).padStart(6)}%) ${relative(file.source)}\n`,
    )
  }

  if (result.percent + Number.EPSILON < minimum) {
    process.stderr.write(`Strict line coverage must be at least ${minimum.toFixed(2)}%.\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run()
}
