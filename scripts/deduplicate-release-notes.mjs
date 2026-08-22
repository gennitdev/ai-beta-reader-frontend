import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const commitLinkSuffix = /\s+\(\[[0-9a-f]{7,40}\]\([^\n)]+\/commit\/[0-9a-f]{7,40}\)\)\s*$/i

/**
 * Remove repeated changelog bullets produced when Release Please sees both a
 * merge commit and the Conventional Commit that the merge contains.
 *
 * Deduplication is deliberately scoped to a single release section and
 * changelog category. Similar wording, entries in different categories, and
 * entries from older releases are retained.
 *
 * @param {string} markdown
 * @returns {{ markdown: string, removed: number }}
 */
export function deduplicateReleaseNotes(markdown) {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n'
  const lines = markdown.split(/\r?\n/)
  let release = ''
  let category = ''
  let removed = 0
  const seen = new Map()

  const output = lines.filter((line) => {
    if (/^##\s+/.test(line)) {
      release = line.trim()
      category = ''
      return true
    }

    if (/^###\s+/.test(line)) {
      category = line.trim()
      return true
    }

    if (!/^\s*[*-]\s+/.test(line) || !commitLinkSuffix.test(line)) {
      return true
    }

    const section = `${release}\n${category}`
    const entry = line.replace(commitLinkSuffix, '').trim()
    const entries = seen.get(section) ?? new Set()

    if (entries.has(entry)) {
      removed += 1
      return false
    }

    entries.add(entry)
    seen.set(section, entries)
    return true
  })

  return { markdown: output.join(newline), removed }
}

function parseArguments(args) {
  const files = []
  let bodyOutput
  let githubOutput
  let prEnvironment

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === '--body-output') {
      bodyOutput = args[index += 1]
    } else if (argument === '--github-output') {
      githubOutput = args[index += 1]
    } else if (argument === '--pr-env') {
      prEnvironment = args[index += 1]
    } else {
      files.push(argument)
    }
  }

  return { bodyOutput, files, githubOutput, prEnvironment }
}

function run() {
  const { bodyOutput, files, githubOutput, prEnvironment } = parseArguments(process.argv.slice(2))
  let removed = 0

  for (const file of files) {
    const result = deduplicateReleaseNotes(readFileSync(file, 'utf8'))
    writeFileSync(file, result.markdown)
    removed += result.removed
  }

  if (prEnvironment) {
    const pullRequest = JSON.parse(process.env[prEnvironment] ?? '')
    const result = deduplicateReleaseNotes(pullRequest.body)

    if (!bodyOutput || !githubOutput) {
      throw new Error('--pr-env requires --body-output and --github-output')
    }

    writeFileSync(bodyOutput, result.markdown)
    appendFileSync(githubOutput, `pr_number=${pullRequest.number}\n`)
    removed += result.removed
  }

  process.stdout.write(`Removed ${removed} duplicate release note${removed === 1 ? '' : 's'}.\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
}
