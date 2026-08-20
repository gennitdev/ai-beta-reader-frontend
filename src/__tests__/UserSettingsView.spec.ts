// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

// Characterization tests: they capture UserSettingsView's *current* behavior so a
// later refactor (extracting composables) can be verified to preserve it.

const h = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  books: [] as Array<Record<string, unknown>>,
  chapters: [] as Array<Record<string, unknown>>,
  loadBooks: vi.fn(async () => {}),
  loadChapters: vi.fn(async () => {}),
  getParts: vi.fn(async () => [] as unknown[]),
  getNotes: vi.fn(async () => null as unknown),
  backupToCloud: vi.fn(async () => {}),
  restoreFromCloud: vi.fn(async () => {}),
  hasCloudSync: vi.fn(() => true),
  prepareCloudSync: vi.fn(async () => {}),
  cloudSyncReady: true,
  initializeDatabase: vi.fn(async () => {}),
  canStoreImages: false,
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: h.push, back: h.back }),
}))

vi.mock('@/composables/useDatabase', async () => {
  const { ref } = await import('vue')
  return {
    initializeDatabase: h.initializeDatabase,
    useDatabase: () => ({
      books: ref(h.books),
      chapters: ref(h.chapters),
      loadBooks: h.loadBooks,
      loadChapters: h.loadChapters,
      getParts: h.getParts,
      getNotes: h.getNotes,
      backupToCloud: h.backupToCloud,
      restoreFromCloud: h.restoreFromCloud,
      hasCloudSync: h.hasCloudSync,
      prepareCloudSync: h.prepareCloudSync,
      cloudSyncReady: ref(h.cloudSyncReady),
    }),
  }
})

vi.mock('@/composables/useImageLibrary', async () => {
  const { ref } = await import('vue')
  return {
    useImageLibrary: () => ({
      canStoreImages: ref(h.canStoreImages),
      fetchBookCover: vi.fn(async () => null),
      fetchPartCover: vi.fn(async () => null),
      fetchChapterImages: vi.fn(async () => []),
      getImageBlob: vi.fn(async () => new Blob()),
    }),
  }
})

vi.mock('@/lib/browserStorage', () => ({
  formatStorageBytes: (n: number) => `${n} B`,
  getBrowserStorageSnapshot: vi.fn(async () => ({ usage: 0, quota: 0, persisted: false })),
  requestPersistentBrowserStorage: vi.fn(async () => true),
}))

vi.mock('@/utils/platform', () => ({
  isDesktopAppRuntime: () => false,
}))

import UserSettingsView from '@/views/UserSettingsView.vue'
import { BARDWALL_ENABLED_STORAGE_KEY } from '@/composables/useBardwallSettings'
import { setTheme, THEME_STORAGE_KEY } from '@/composables/useTheme'

const wrappers: VueWrapper[] = []

function mountView() {
  const wrapper = mount(UserSettingsView, {
    global: {
      stubs: {
        ArrowLeftIcon: true, DocumentArrowDownIcon: true, KeyIcon: true,
        EyeIcon: true, EyeSlashIcon: true, CloudArrowUpIcon: true,
        ArrowPathIcon: true, CircleStackIcon: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

function button(wrapper: VueWrapper, label: string) {
  const match = wrapper.findAll('button').find((candidate) => candidate.text().trim() === label)
  if (!match) throw new Error(`Button not found: ${label}`)
  return match
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setTheme('light')
  localStorage.removeItem(THEME_STORAGE_KEY)
  h.books = []
  h.chapters = []
  h.cloudSyncReady = true
  h.hasCloudSync.mockReturnValue(true)
  h.canStoreImages = false
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('alert', vi.fn())
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('UserSettingsView', () => {
  describe('appearance setting', () => {
    it('switches themes and persists the selection', async () => {
      const wrapper = mountView()
      await flushPromises()

      expect(wrapper.get('[data-testid="theme-light"]').attributes('aria-checked')).toBe('true')

      await wrapper.get('[data-testid="theme-dark"]').trigger('click')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
      expect(wrapper.get('[data-testid="theme-dark"]').attributes('aria-checked')).toBe('true')

      await wrapper.get('[data-testid="theme-light"]').trigger('click')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    })
  })

  describe('Bardwall feature setting', () => {
    it('shows Bardwall by default', async () => {
      const wrapper = mountView()
      await flushPromises()

      const toggle = wrapper.get('[data-testid="bardwall-enabled"]')
      expect((toggle.element as HTMLInputElement).checked).toBe(true)
    })

    it('persists hiding Bardwall without changing game data', async () => {
      localStorage.setItem('bardwall-game-state', '{"coins":42}')
      const wrapper = mountView()
      await flushPromises()

      await wrapper.get('[data-testid="bardwall-enabled"]').setValue(false)
      await flushPromises()

      expect(localStorage.getItem(BARDWALL_ENABLED_STORAGE_KEY)).toBe('false')
      expect(localStorage.getItem('bardwall-game-state')).toBe('{"coins":42}')
    })
  })

  it('initializes the database and loads an existing API key on mount', async () => {
    localStorage.setItem('openai_api_key', 'sk-existing')
    const wrapper = mountView()
    await flushPromises()

    expect(h.initializeDatabase).toHaveBeenCalled()
    const input = wrapper.get('input[placeholder="sk-..."]')
    expect((input.element as HTMLInputElement).value).toBe('sk-existing')
  })

  describe('OpenAI API key', () => {
    it('rejects an empty key', async () => {
      const wrapper = mountView()
      await flushPromises()

      await button(wrapper, 'Save').trigger('click')

      expect(wrapper.text()).toContain('Please enter an API key')
      expect(localStorage.getItem('openai_api_key')).toBeNull()
    })

    it('rejects a key that does not start with sk-', async () => {
      const wrapper = mountView()
      await flushPromises()

      await wrapper.get('input[placeholder="sk-..."]').setValue('nope-123')
      await button(wrapper, 'Save').trigger('click')

      expect(wrapper.text()).toContain('should start with "sk-"')
      expect(localStorage.getItem('openai_api_key')).toBeNull()
    })

    it('saves a valid key to localStorage', async () => {
      const wrapper = mountView()
      await flushPromises()

      await wrapper.get('input[placeholder="sk-..."]').setValue('sk-valid-key')
      await button(wrapper, 'Save').trigger('click')

      expect(localStorage.getItem('openai_api_key')).toBe('sk-valid-key')
      expect(wrapper.text()).toContain('API key saved successfully')
    })

    it('removes the stored key after confirmation', async () => {
      localStorage.setItem('openai_api_key', 'sk-existing')
      const wrapper = mountView()
      await flushPromises()

      await button(wrapper, 'Remove').trigger('click')

      expect(confirm).toHaveBeenCalled()
      expect(localStorage.getItem('openai_api_key')).toBeNull()
      expect(wrapper.text()).toContain('API key removed')
    })
  })

  describe('cloud backup and restore', () => {
    it('discloses the limited Google Drive access before authorization', async () => {
      const wrapper = mountView()
      await flushPromises()

      expect(wrapper.text()).toContain('only the backup file it creates')
      expect(wrapper.text()).toContain('It cannot access unrelated Drive files')
      expect(wrapper.text()).toContain('Privacy Policy')
    })

    it('disables backup and restore until an encryption password is entered', async () => {
      const wrapper = mountView()
      await flushPromises()

      // No password yet -> both actions disabled.
      expect(button(wrapper, 'Backup to Google Drive').attributes('disabled')).toBeDefined()
      expect(button(wrapper, 'Restore from Backup').attributes('disabled')).toBeDefined()

      await wrapper
        .get('input[placeholder="Enter a password used to encrypt your backup"]')
        .setValue('hunter2')

      // With a password (and cloud sync available + ready) they enable.
      expect(button(wrapper, 'Backup to Google Drive').attributes('disabled')).toBeUndefined()
      expect(button(wrapper, 'Restore from Backup').attributes('disabled')).toBeUndefined()
    })

    it('backs up to the cloud with the entered password', async () => {
      const wrapper = mountView()
      await flushPromises()

      await wrapper
        .get('input[placeholder="Enter a password used to encrypt your backup"]')
        .setValue('hunter2')
      await button(wrapper, 'Backup to Google Drive').trigger('click')
      await flushPromises()

      expect(h.backupToCloud).toHaveBeenCalledWith('hunter2')
      expect(wrapper.text()).toContain('Backup saved to Google Drive')
    })

    it('surfaces a backup failure message', async () => {
      h.backupToCloud.mockRejectedValueOnce(new Error('drive offline'))
      const wrapper = mountView()
      await flushPromises()

      await wrapper
        .get('input[placeholder="Enter a password used to encrypt your backup"]')
        .setValue('hunter2')
      await button(wrapper, 'Backup to Google Drive').trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('Backup failed: drive offline')
    })

    it('restores from the cloud after confirmation', async () => {
      const wrapper = mountView()
      await flushPromises()

      await wrapper
        .get('input[placeholder="Enter a password used to encrypt your backup"]')
        .setValue('hunter2')
      await button(wrapper, 'Restore from Backup').trigger('click')
      await flushPromises()

      expect(confirm).toHaveBeenCalled()
      expect(h.restoreFromCloud).toHaveBeenCalledWith('hunter2')
      expect(wrapper.text()).toContain('Backup restored from Google Drive')
    })

    it('does not restore when the confirmation is dismissed', async () => {
      vi.stubGlobal('confirm', vi.fn(() => false))
      const wrapper = mountView()
      await flushPromises()

      await wrapper
        .get('input[placeholder="Enter a password used to encrypt your backup"]')
        .setValue('hunter2')
      await button(wrapper, 'Restore from Backup').trigger('click')
      await flushPromises()

      expect(h.restoreFromCloud).not.toHaveBeenCalled()
    })
  })

  it('starts an export from the local database', async () => {
    // Export generates a zip + triggers a browser download; stub the URL bits so
    // the flow runs headlessly. Both format paths begin by loading books.
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
    const wrapper = mountView()
    await flushPromises()

    await button(wrapper, 'Export Data').trigger('click')
    await flushPromises()

    expect(h.loadBooks).toHaveBeenCalled()
  })
})
