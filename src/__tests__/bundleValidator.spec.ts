import { afterEach, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { validateBundlePath } from '../../scripts/bundleValidator'
import { createAgentWorkspaceScaffold } from '@/lib/libraryBundle/agentWorkspace'
import { createBundleZip } from '@/lib/libraryBundle/adapters/zip'
import { writeLibraryBundle } from '@/lib/libraryBundle/write'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'

const temporaryDirectories: string[] = []
const execFileAsync = promisify(execFile)

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'beta-bot-validator-'))
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

describe('standalone bundle validator', () => {
  it('validates directory workspaces without database access or scaffold warnings', async () => {
    const directory = await temporaryDirectory()
    const bundle = await writeLibraryBundle(completeCanonicalLibraryFixture(), {
      bundleId: 'bundle:validator', exportedAt: '2026-08-20T00:00:00.000Z', appVersion: '2.0.0',
    })
    await writeFiles(directory, new Map([...bundle.files, ...createAgentWorkspaceScaffold()]))
    await writeFile(join(directory, 'README.md'), '# Example story\n')
    await mkdir(join(directory, '.github', 'workflows'), { recursive: true })
    await writeFile(join(directory, '.github', 'workflows', 'validate.yml'), 'name: Validate\n')
    await mkdir(join(directory, '.git'))
    await writeFile(join(directory, '.git', 'config'), 'ignored git metadata')

    const result = await validateBundlePath(directory)

    expect(result.valid).toBe(true)
    expect(result.replaceEligible).toBe(true)
    expect(result.entityCount).toBeGreaterThan(0)
    expect(result.diagnostics.map((value) => value.code)).not.toContain('file.unknown')

    const command = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', 'scripts/validate-bundle.ts', directory],
      { cwd: process.cwd() },
    )
    expect(command.stdout).toContain('Valid Beta Bot bundle')
  })

  it('validates ZIPs and returns exhaustive diagnostics for corrupt workspaces', async () => {
    const directory = await temporaryDirectory()
    const bundle = await writeLibraryBundle(completeCanonicalLibraryFixture(), {
      bundleId: 'bundle:validator', exportedAt: '2026-08-20T00:00:00.000Z', appVersion: '2.0.0',
    })
    const zipPath = join(directory, 'library.zip')
    await writeFile(zipPath, await createBundleZip(bundle.files))
    await expect(validateBundlePath(zipPath)).resolves.toMatchObject({ valid: true, replaceEligible: true })

    const workspace = join(directory, 'workspace')
    await writeFiles(workspace, bundle.files)
    const chapterPath = [...bundle.files.keys()].find((path) => path.endsWith('/chapter.md')) as string
    await writeFile(join(workspace, ...chapterPath.split('/')), 'invalid chapter')
    const invalid = await validateBundlePath(workspace)
    expect(invalid.valid).toBe(false)
    expect(invalid.diagnostics.map((value) => value.code)).toContain('markdown.frontmatter')
  })
})
