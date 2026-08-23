import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useCloudSync } from '@/composables/useCloudSync'
import type { DriveBackupGeneration } from '@/lib/libraryBundle/adapters/drive'

const generation = (over: Partial<DriveBackupGeneration> = {}): DriveBackupGeneration =>
  ({ id: 'gen-1', name: 'backup', createdTime: '2026-01-01T00:00:00Z', ...over }) as DriveBackupGeneration

function setup(overrides: Partial<Parameters<typeof useCloudSync>[0]> = {}) {
  const cloudSyncReady = ref(true)
  const deps = {
    backupToCloud: vi.fn(async () => {}),
    restoreFromCloud: vi.fn(async () => {}),
    listCloudBackups: vi.fn(async () => [generation()]),
    hasCloudSync: vi.fn(() => true),
    cloudSyncReady,
    ...overrides,
  }
  return { deps, cloudSyncReady, sync: useCloudSync(deps) }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useCloudSync', () => {
  it('exposes availability from the injected predicate', () => {
    const { sync } = setup({ hasCloudSync: vi.fn(() => false) })
    expect(sync.cloudSyncAvailable.value).toBe(false)
  })

  it('refuses to back up without an encryption password', async () => {
    const { sync, deps } = setup()
    await sync.handleCloudBackup()

    expect(deps.backupToCloud).not.toHaveBeenCalled()
    expect(sync.cloudMessage.value).toContain('password')
    expect(sync.cloudMessageType.value).toBe('error')
  })

  it('gates backup when cloud sync is not configured', async () => {
    const { sync, deps } = setup({ hasCloudSync: vi.fn(() => false) })
    sync.cloudPassword.value = 'secret'
    await sync.handleCloudBackup()

    expect(deps.backupToCloud).not.toHaveBeenCalled()
    expect(sync.cloudMessage.value).toContain('not configured')
    expect(sync.cloudMessageType.value).toBe('error')
  })

  it('gates backup while the Drive services are still preparing', async () => {
    const { sync, deps, cloudSyncReady } = setup()
    cloudSyncReady.value = false
    sync.cloudPassword.value = 'secret'
    await sync.handleCloudBackup()

    expect(deps.backupToCloud).not.toHaveBeenCalled()
    expect(sync.cloudMessage.value).toContain('preparing')
  })

  it('backs up, refreshes generations, and reports success', async () => {
    const { sync, deps } = setup()
    sync.cloudPassword.value = 'secret'
    await sync.handleCloudBackup()

    expect(deps.backupToCloud).toHaveBeenCalledWith('secret')
    expect(deps.listCloudBackups).toHaveBeenCalled()
    expect(sync.cloudGenerations.value).toHaveLength(1)
    expect(sync.isBackingUp.value).toBe(false)
    expect(sync.cloudMessageType.value).toBe('success')
    expect(sync.cloudMessage.value).toContain('Backup saved')
  })

  it('reports a failed backup and resets the in-flight flag', async () => {
    const { sync } = setup({ backupToCloud: vi.fn(async () => { throw new Error('quota exceeded') }) })
    sync.cloudPassword.value = 'secret'
    await sync.handleCloudBackup()

    expect(sync.cloudMessage.value).toBe('Backup failed: quota exceeded')
    expect(sync.cloudMessageType.value).toBe('error')
    expect(sync.isBackingUp.value).toBe(false)
  })

  it('refuses to restore without a password', async () => {
    const { sync, deps } = setup()
    await sync.handleCloudRestore()

    expect(deps.restoreFromCloud).not.toHaveBeenCalled()
    expect(sync.cloudMessageType.value).toBe('error')
  })

  it('does not restore when the confirmation is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const { sync, deps } = setup()
    sync.cloudPassword.value = 'secret'
    await sync.handleCloudRestore('gen-9')

    expect(deps.restoreFromCloud).not.toHaveBeenCalled()
  })

  it('restores a specific generation and reports success', async () => {
    const { sync, deps } = setup()
    sync.cloudPassword.value = 'secret'
    await sync.handleCloudRestore('gen-9')

    expect(deps.restoreFromCloud).toHaveBeenCalledWith('secret', 'gen-9')
    expect(sync.isRestoring.value).toBe(false)
    expect(sync.cloudMessageType.value).toBe('success')
  })

  it('reports the underlying error when a restore fails', async () => {
    const { sync } = setup({ restoreFromCloud: vi.fn(async () => { throw new Error('wrong password') }) })
    sync.cloudPassword.value = 'secret'
    await sync.handleCloudRestore()

    expect(sync.cloudMessage.value).toBe('wrong password')
    expect(sync.cloudMessageType.value).toBe('error')
    expect(sync.isRestoring.value).toBe(false)
  })

  it('notes when no versioned backups exist while refreshing', async () => {
    const { sync } = setup({ listCloudBackups: vi.fn(async () => []) })
    await sync.refreshCloudGenerations()
    await flushPromises()

    expect(sync.cloudGenerations.value).toHaveLength(0)
    expect(sync.cloudMessage.value).toContain('No versioned backups')
    expect(sync.isLoadingGenerations.value).toBe(false)
  })
})
