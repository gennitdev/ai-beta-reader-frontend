#!/usr/bin/env node
import type { BundleDiagnostic } from '../src/lib/libraryBundle/diagnostics'
import { validateBundlePath } from './bundleValidator'

function formatDiagnostic(diagnostic: BundleDiagnostic): string {
  const location = [diagnostic.path, diagnostic.entityType && diagnostic.entityId
    ? `${diagnostic.entityType}:${diagnostic.entityId}`
    : undefined].filter(Boolean).join(' ')
  return `${diagnostic.severity.toUpperCase()} ${diagnostic.code}${location ? ` [${location}]` : ''}: ${diagnostic.message}`
}
const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: pnpm validate:bundle -- <bundle-directory-or-zip>')
  process.exitCode = 2
} else {
  const result = await validateBundlePath(inputPath)
  result.diagnostics.forEach((diagnostic) => {
    const output = formatDiagnostic(diagnostic)
    if (diagnostic.severity === 'error') console.error(output)
    else console.warn(output)
  })
  if (result.valid) {
    console.log(`Valid Beta Bot bundle: ${result.fileCount} files, ${result.entityCount} entities${result.replaceEligible ? ', eligible for full-library Replace' : ''}.`)
  } else {
    console.error('Beta Bot bundle validation failed.')
    process.exitCode = 1
  }
}
