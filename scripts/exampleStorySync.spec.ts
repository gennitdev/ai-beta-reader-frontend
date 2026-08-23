import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentWorkspaceScaffold } from '../src/lib/libraryBundle/agentWorkspace'
import { readBundleZip } from '../src/lib/libraryBundle/adapters/zip'
import { writeLibraryBundle } from '../src/lib/libraryBundle/write'
import { completeCanonicalLibraryFixture } from '../src/__tests__/fixtures/libraryBundle'
import { validateLibraryBundle } from '../src/lib/libraryBundle/validate'
import { readLibraryBundle } from '../src/lib/libraryBundle/read'
import { syncExampleStory } from './exampleStorySync'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'example-story-sync-'))
  temporaryDirectories.push(directory)
  return directory
}

async function writeFiles(root: string, files: ReadonlyMap<string, Uint8Array>): Promise<void> {
  for (const [path, bytes] of files) {
    const target = join(root, ...path.split('/'))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('example story sync', () => {
  it('packages only canonical files deterministically and records source provenance', async () => {
    const root = await temporaryDirectory()
    const source = join(root, 'source')
    const firstZip = join(root, 'first.zip')
    const secondZip = join(root, 'second.zip')
    const firstProvenance = join(root, 'first.json')
    const secondProvenance = join(root, 'second.json')
    const written = await writeLibraryBundle(completeCanonicalLibraryFixture(), {
      bundleId: 'bundle:example', exportedAt: '2026-08-22T00:00:00.000Z', appVersion: 'test',
    })
    await writeFiles(source, new Map([...written.files, ...createAgentWorkspaceScaffold()]))
    await writeFile(join(source, 'README.md'), '# Human documentation\n')

    const options = {
      sourceDirectory: source,
      sourceRepository: 'https://github.com/gennitdev/example-story-jack',
      sourceCommit: 'a'.repeat(40),
    }
    const first = await syncExampleStory({ ...options, outputZipPath: firstZip, provenancePath: firstProvenance })
    const second = await syncExampleStory({ ...options, outputZipPath: secondZip, provenancePath: secondProvenance })

    expect(new Uint8Array(await readFile(firstZip))).toEqual(new Uint8Array(await readFile(secondZip)))
    expect(first).toEqual(second)
    expect(first.sourceCommit).toBe('a'.repeat(40))
    expect(first.sourceRepository).toBe(options.sourceRepository)

    const transport = await readBundleZip(new Uint8Array(await readFile(firstZip)))
    expect(transport.files?.has('README.md')).toBe(false)
    expect(transport.files?.has('AGENTS.md')).toBe(false)
    const parsed = readLibraryBundle(transport.files!)
    const validated = await validateLibraryBundle(parsed, transport.files!)
    expect(validated.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([])
  })
})
