import { describe, expect, it } from 'vitest'
import { createAgentWorkspaceScaffold } from '@/lib/libraryBundle/agentWorkspace'
import {
  readBundleDirectoryEntries,
  writeBundleDirectory,
  type BundleDirectoryHandle,
  type BundleFileHandle,
  type BundleWritableFile,
} from '@/lib/libraryBundle/adapters/directory'
import { writeLibraryBundle } from '@/lib/libraryBundle/write'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'

type MemoryEntry = MemoryDirectory | Uint8Array

class MemoryDirectory implements BundleDirectoryHandle {
  readonly kind = 'directory' as const
  readonly entries = new Map<string, MemoryEntry>()
  readonly failWritePaths = new Set<string>()
  afterInjectedWriteFailure: (() => void) | null = null
  failNextRemovePath: string | null = null
  afterInjectedRemoveFailure: (() => void) | null = null
  corruptNextReadPath: string | null = null

  constructor(readonly name = '', private readonly root: MemoryDirectory = undefined as never, private readonly prefix = '') {
    if (!root) this.root = this
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<BundleFileHandle> {
    const entry = this.entries.get(name)
    if (entry instanceof MemoryDirectory) throw Object.assign(new Error('directory'), { name: 'TypeMismatchError' })
    if (!entry && !options.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' })
    if (!entry) this.entries.set(name, new Uint8Array())
    const entries = this.entries
    const root = this.root
    const path = this.prefix ? `${this.prefix}/${name}` : name
    return {
      kind: 'file',
      async getFile() {
        const bytes = entries.get(name) as Uint8Array
        if (root.corruptNextReadPath === path) {
          root.corruptNextReadPath = null
          return new Blob([new Uint8Array([...bytes, 255]).buffer])
        }
        return new Blob([bytes.slice().buffer])
      },
      async createWritable(): Promise<BundleWritableFile> {
        let pending = new Uint8Array()
        return {
          async write(blob) { pending = new Uint8Array(await blob.arrayBuffer()) },
          async close() {
            if (root.failWritePaths.delete(path)) {
              root.afterInjectedWriteFailure?.()
              root.afterInjectedWriteFailure = null
              throw new Error(`injected write failure for ${path}`)
            }
            entries.set(name, pending)
          },
        }
      },
    }
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<BundleDirectoryHandle> {
    const entry = this.entries.get(name)
    if (entry instanceof Uint8Array) throw Object.assign(new Error('file'), { name: 'TypeMismatchError' })
    if (entry) return entry
    if (!options.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' })
    const prefix = this.prefix ? `${this.prefix}/${name}` : name
    const directory = new MemoryDirectory(name, this.root, prefix)
    this.entries.set(name, directory)
    return directory
  }

  async removeEntry(name: string): Promise<void> {
    const path = this.prefix ? `${this.prefix}/${name}` : name
    if (this.root.failNextRemovePath === path) {
      this.root.failNextRemovePath = null
      this.root.afterInjectedRemoveFailure?.()
      this.root.afterInjectedRemoveFailure = null
      throw new Error(`injected remove failure for ${path}`)
    }
    if (!this.entries.delete(name)) throw Object.assign(new Error('missing'), { name: 'NotFoundError' })
  }

  private async nestedDirectory(segments: readonly string[]): Promise<BundleDirectoryHandle> {
    if (!segments.length) return this
    const [segment, ...remaining] = segments
    const child = await this.getDirectoryHandle(segment, { create: true }) as MemoryDirectory
    return child.nestedDirectory(remaining)
  }

  async seed(path: string, value: string | Uint8Array): Promise<void> {
    const segments = path.split('/')
    const name = segments.pop() as string
    const directory = await this.nestedDirectory(segments)
    const file = await directory.getFileHandle(name, { create: true })
    const writable = await file.createWritable()
    await writable.write(new Blob([typeof value === 'string' ? value : value.slice().buffer]))
    await writable.close()
  }

  async removePath(path: string): Promise<void> {
    const segments = path.split('/')
    const name = segments.pop() as string
    const directory = await this.nestedDirectory(segments)
    await directory.removeEntry(name)
  }

  snapshot(prefix = ''): Map<string, Uint8Array> {
    const result = new Map<string, Uint8Array>()
    for (const [name, entry] of this.entries) {
      const path = prefix ? `${prefix}/${name}` : name
      if (entry instanceof MemoryDirectory) {
        entry.snapshot(path).forEach((bytes, childPath) => result.set(childPath, bytes))
      } else result.set(path, entry.slice())
    }
    return result
  }
}

const options = (bundleId: string) => ({
  bundleId, exportedAt: '2026-08-20T00:00:00.000Z', appVersion: '2.0.0',
})

describe('canonical bundle directory writer', () => {
  it('updates only managed files, removes obsolete assets, and preserves workspace files', async () => {
    const root = new MemoryDirectory()
    const first = await writeLibraryBundle(completeCanonicalLibraryFixture(), options('bundle:first'))
    await root.seed('notes/private.txt', 'keep me')

    const created = await writeBundleDirectory(root, first.files, createAgentWorkspaceScaffold())
    expect(created).toEqual({ writtenFiles: first.files.size, deletedFiles: 0, scaffoldedFiles: 2 })
    await root.seed('AGENTS.md', 'custom agent instructions')

    const model = completeCanonicalLibraryFixture()
    model.books[0].title = 'Renamed Book'
    model.books[0].cover_image_id = null
    model.chapter_notes = []
    model.assets = []
    const second = await writeLibraryBundle(model, options('bundle:second'))
    const updated = await writeBundleDirectory(root, second.files, createAgentWorkspaceScaffold())
    const snapshot = root.snapshot()

    expect(updated.deletedFiles).toBeGreaterThanOrEqual(4)
    expect(snapshot.has('books/a-book--book-1/book.yaml')).toBe(false)
    expect(snapshot.has('books/a-book--book-1/assets/image-1/cover.png')).toBe(false)
    expect(new TextDecoder().decode(snapshot.get('notes/private.txt'))).toBe('keep me')
    expect(new TextDecoder().decode(snapshot.get('AGENTS.md'))).toBe('custom agent instructions')
    expect(snapshot.has('books/renamed-book--book-1/book.yaml')).toBe(true)
  })

  it('refuses to overwrite an unknown file at a canonical path', async () => {
    const root = new MemoryDirectory()
    const bundle = await writeLibraryBundle(completeCanonicalLibraryFixture(), options('bundle:first'))
    const collision = [...bundle.files.keys()].find((path) => path.endsWith('/book.yaml')) as string
    await root.seed(collision, 'not owned by beta bot')

    await expect(writeBundleDirectory(root, bundle.files)).rejects.toThrow('overwrite unknown file')
    expect(new TextDecoder().decode(root.snapshot().get(collision))).toBe('not owned by beta bot')
  })

  it('rolls back overwritten and newly created files after a verified write fails', async () => {
    const root = new MemoryDirectory()
    const first = await writeLibraryBundle(completeCanonicalLibraryFixture(), options('bundle:first'))
    await writeBundleDirectory(root, first.files, createAgentWorkspaceScaffold())
    const before = root.snapshot()

    const model = completeCanonicalLibraryFixture()
    model.chapters[0].title = 'A New Path'
    const second = await writeLibraryBundle(model, options('bundle:second'))
    root.failWritePaths.add([...second.files.keys()].find((path) => path.includes('a-new-path')) as string)

    await expect(writeBundleDirectory(root, second.files, createAgentWorkspaceScaffold()))
      .rejects.toThrow('prior bundle was restored')
    expect([...root.snapshot()].map(([path, bytes]) => [path, [...bytes]]))
      .toEqual([...before].map(([path, bytes]) => [path, [...bytes]]))
  })

  it('rejects unsafe output paths and incomplete or invalid existing bundle metadata', async () => {
    await expect(writeBundleDirectory(
      new MemoryDirectory(),
      new Map([['../unsafe', new Uint8Array()]]),
    )).rejects.toThrow('Path must be relative')
    expect(readBundleDirectoryEntries([{ path: '../unsafe', bytes: new Uint8Array() }]).files).toBeNull()

    const bundle = await writeLibraryBundle(completeCanonicalLibraryFixture(), options('bundle:first'))
    const manifest = bundle.files.get('beta-bot.yaml') as Uint8Array
    const inventory = bundle.files.get('_beta-bot/inventory.json') as Uint8Array
    const cases: Array<{ manifest?: string | Uint8Array; inventory?: string | Uint8Array; message: string }> = [
      { manifest, message: 'incomplete Beta Bot bundle' },
      { manifest: '[]\n', inventory, message: 'must contain a YAML mapping' },
      { manifest: 'format: [\n', inventory, message: 'not valid canonical YAML' },
      { manifest: 'format: something-else\nbundle_id: "bundle:first"\n', inventory, message: 'not a Beta Bot library bundle' },
      { manifest, inventory: 'not json', message: 'not valid JSON' },
      { manifest, inventory: JSON.stringify({ inventory_version: 1, bundle_id: 'other', entities: [] }), message: 'mismatched' },
    ]
    for (const value of cases) {
      const root = new MemoryDirectory()
      if (value.manifest) await root.seed('beta-bot.yaml', value.manifest)
      if (value.inventory) await root.seed('_beta-bot/inventory.json', value.inventory)
      await expect(writeBundleDirectory(root, bundle.files)).rejects.toThrow(value.message)
    }

    const typeMismatch = new MemoryDirectory()
    await typeMismatch.getDirectoryHandle('beta-bot.yaml', { create: true })
    await expect(writeBundleDirectory(typeMismatch, bundle.files)).rejects.toThrow('directory')

    const maliciousInventory = JSON.parse(new TextDecoder().decode(inventory))
    maliciousInventory.entities[0].path = 'notes/private.txt'
    const claimedUnknown = new MemoryDirectory()
    await claimedUnknown.seed('beta-bot.yaml', manifest)
    await claimedUnknown.seed('_beta-bot/inventory.json', JSON.stringify(maliciousInventory))
    await claimedUnknown.seed('notes/private.txt', 'never delete me')
    await expect(writeBundleDirectory(claimedUnknown, bundle.files)).rejects.toThrow('unsafe managed path')
    expect(new TextDecoder().decode(claimedUnknown.snapshot().get('notes/private.txt'))).toBe('never delete me')
  })

  it('detects failed write verification and rolls back scaffolds and deletions', async () => {
    const root = new MemoryDirectory()
    const first = await writeLibraryBundle(completeCanonicalLibraryFixture(), options('bundle:first'))
    root.corruptNextReadPath = 'beta-bot.yaml'
    await expect(writeBundleDirectory(root, first.files, createAgentWorkspaceScaffold()))
      .rejects.toThrow('prior bundle was restored')
    expect(root.snapshot().size).toBe(0)

    const scaffoldFailure = new MemoryDirectory()
    scaffoldFailure.failWritePaths.add('.gitattributes')
    await expect(writeBundleDirectory(scaffoldFailure, first.files, createAgentWorkspaceScaffold()))
      .rejects.toThrow('prior bundle was restored')
    expect(scaffoldFailure.snapshot().size).toBe(0)

    await writeBundleDirectory(root, first.files, createAgentWorkspaceScaffold())
    const before = root.snapshot()
    const model = completeCanonicalLibraryFixture()
    model.chapter_notes = []
    const second = await writeLibraryBundle(model, options('bundle:second'))
    const obsoleteNote = [...first.files.keys()].find((path) => path.endsWith('/notes.md')) as string
    root.failNextRemovePath = obsoleteNote
    await expect(writeBundleDirectory(root, second.files, createAgentWorkspaceScaffold()))
      .rejects.toThrow('prior bundle was restored')
    expect([...root.snapshot()].map(([path, bytes]) => [path, [...bytes]]).sort())
      .toEqual([...before].map(([path, bytes]) => [path, [...bytes]]).sort())

    const scaffoldRollbackFailure = new MemoryDirectory()
    scaffoldRollbackFailure.failWritePaths.add('.gitattributes')
    scaffoldRollbackFailure.failNextRemovePath = '.gitattributes'
    await expect(writeBundleDirectory(scaffoldRollbackFailure, first.files, createAgentWorkspaceScaffold()))
      .rejects.toThrow('could not be fully rolled back')

    root.failNextRemovePath = obsoleteNote
    root.afterInjectedRemoveFailure = () => { root.failWritePaths.add(obsoleteNote) }
    await expect(writeBundleDirectory(root, second.files, createAgentWorkspaceScaffold()))
      .rejects.toThrow('could not be fully rolled back')
  })

  it('reports when rollback itself fails', async () => {
    const root = new MemoryDirectory()
    const first = await writeLibraryBundle(completeCanonicalLibraryFixture(), options('bundle:first'))
    await writeBundleDirectory(root, first.files)
    const model = completeCanonicalLibraryFixture()
    model.chapters[0].title = 'A New Path'
    const second = await writeLibraryBundle(model, options('bundle:second'))
    root.failWritePaths.add([...second.files.keys()].find((path) => path.includes('a-new-path')) as string)
    root.afterInjectedWriteFailure = () => { root.failWritePaths.add('beta-bot.yaml') }

    await expect(writeBundleDirectory(root, second.files))
      .rejects.toThrow('could not be fully rolled back')
  })

  it('preserves an old asset binary when edited metadata cannot identify it safely', async () => {
    const root = new MemoryDirectory()
    const first = await writeLibraryBundle(completeCanonicalLibraryFixture(), options('bundle:first'))
    await writeBundleDirectory(root, first.files)
    const assetMetadata = [...first.files.keys()].find((path) => path.endsWith('/asset.yaml')) as string
    const assetBinary = [...first.files.keys()].find((path) => path.endsWith('/cover.png')) as string
    await root.seed(assetMetadata, ': invalid')
    const model = completeCanonicalLibraryFixture()
    model.books[0].cover_image_id = null
    model.assets = []
    const second = await writeLibraryBundle(model, options('bundle:second'))

    await writeBundleDirectory(root, second.files)

    expect(root.snapshot().has(assetMetadata)).toBe(false)
    expect(root.snapshot().has(assetBinary)).toBe(true)

    const missingMetadata = new MemoryDirectory()
    await writeBundleDirectory(missingMetadata, first.files)
    await missingMetadata.removePath(assetMetadata)
    await writeBundleDirectory(missingMetadata, second.files)
    expect(missingMetadata.snapshot().has(assetBinary)).toBe(true)
  })
})
