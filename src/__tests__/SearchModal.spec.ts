// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import type {
  FindReplaceDocument,
  ReplaceFindReplaceMatchesResult,
} from '@/lib/findReplace'
import FindReplaceDocumentResult from '@/components/search/FindReplaceDocumentResult.vue'
import SearchModal from '@/components/SearchModal.vue'

const routerMocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => routerMocks }))

const ModalStub = {
  props: ['show'],
  emits: ['close'],
  template: '<section v-if="show"><slot /><slot name="footer" /></section>',
}

const match = {
  id: 'chapter:chapter-1:text:0:0:5',
  field: 'text' as const,
  start: 0,
  end: 5,
  matchedText: 'Ghost',
  before: '',
  after: ' story',
  occurrence: 0,
}
const secondMatch = { ...match, id: 'chapter:chapter-1:text:1:12:17', start: 12, end: 17 }
const document: FindReplaceDocument = {
  targetType: 'chapter',
  targetId: 'chapter-1',
  displayName: 'Opening',
  fields: { title: 'Ghost opening', text: 'Ghost story Ghost' },
  matches: [match, secondMatch],
}

const wrappers: VueWrapper[] = []

function createService() {
  return {
    findReplaceMatches: vi.fn(async () => [document]),
    replaceFindReplaceMatches: vi.fn(async (): Promise<ReplaceFindReplaceMatchesResult> => ({
      replacedCount: 1,
      fields: { title: 'Spirit opening', text: 'Spirit story Ghost' },
    })),
    restoreFindReplaceFields: vi.fn(async () => {}),
  }
}

function mountModal(service = createService(), props: Record<string, unknown> = {}) {
  const wrapper = shallowMount(SearchModal, {
    props: {
      show: true,
      bookId: 'book-1',
      searchService: service,
      ...props,
    },
    global: { stubs: { Modal: ModalStub } },
  })
  wrappers.push(wrapper)
  return { wrapper, service }
}

async function search(wrapper: VueWrapper, term = 'Ghost') {
  await wrapper.get('#search-input').setValue(term)
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
}

function resultComponent(wrapper: VueWrapper) {
  return wrapper.findComponent(FindReplaceDocumentResult)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SearchModal', () => {
  it('debounces scoped searches and reports aggregate results', async () => {
    const { wrapper, service } = mountModal(createService(), {
      initialScope: 'chapter',
      targetId: 'chapter-1',
    })

    await search(wrapper)

    expect(service.findReplaceMatches).toHaveBeenCalledWith({
      bookId: 'book-1',
      searchTerm: 'Ghost',
      scope: 'chapter',
      targetId: 'chapter-1',
    })
    expect(wrapper.text()).toContain('2 matches in 1 document')
    expect(resultComponent(wrapper).props('expanded')).toBe(true)
  })

  it('clears stale results for an empty query and surfaces search failures', async () => {
    const service = createService()
    const { wrapper } = mountModal(service)
    await search(wrapper)
    expect(resultComponent(wrapper).exists()).toBe(true)

    await search(wrapper, '   ')
    expect(resultComponent(wrapper).exists()).toBe(false)

    service.findReplaceMatches.mockRejectedValueOnce(new Error('database unavailable'))
    await search(wrapper, 'missing')
    expect(wrapper.text()).toContain('database unavailable')
    expect(wrapper.text()).toContain('No results found for “missing”')
  })

  it('does not replace until the replacement field has been intentionally edited', async () => {
    const { wrapper, service } = mountModal()
    await search(wrapper)

    resultComponent(wrapper).vm.$emit('replace-match', match)
    await flushPromises()
    expect(service.replaceFindReplaceMatches).not.toHaveBeenCalled()

    await wrapper.get('#replace-input').setValue('Spirit')
    resultComponent(wrapper).vm.$emit('replace-match', match)
    await flushPromises()

    expect(service.replaceFindReplaceMatches).toHaveBeenCalledWith({
      targetType: 'chapter',
      targetId: 'chapter-1',
      replacement: 'Spirit',
      expectedFields: document.fields,
      matches: [match],
    })
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.text()).toContain('Replaced 1 match in “Opening”.')
  })

  it('refreshes stale results after replacement failure while preserving the error', async () => {
    const service = createService()
    service.replaceFindReplaceMatches.mockRejectedValueOnce(new Error('field changed after searching'))
    const { wrapper } = mountModal(service)
    await search(wrapper)
    await wrapper.get('#replace-input').setValue('Spirit')

    resultComponent(wrapper).vm.$emit('replace-match', match)
    await flushPromises()

    expect(service.findReplaceMatches).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('field changed after searching')
    expect(resultComponent(wrapper).props('replacingMatchId')).toBeNull()
  })

  it('requires confirmation for replacing multiple matches', async () => {
    vi.mocked(confirm).mockReturnValueOnce(false)
    const { wrapper, service } = mountModal()
    await search(wrapper)
    await wrapper.get('#replace-input').setValue('Spirit')

    resultComponent(wrapper).vm.$emit('replace-all')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith('Replace all 2 matches in “Opening”?')
    expect(service.replaceFindReplaceMatches).not.toHaveBeenCalled()
  })

  it('preserves selection and expansion state while replacing selected matches', async () => {
    const { wrapper, service } = mountModal()
    await search(wrapper)

    resultComponent(wrapper).vm.$emit('toggle-expanded')
    await wrapper.vm.$nextTick()
    expect(resultComponent(wrapper).props('expanded')).toBe(false)
    resultComponent(wrapper).vm.$emit('toggle-expanded')

    resultComponent(wrapper).vm.$emit('toggle-match', match.id, true)
    resultComponent(wrapper).vm.$emit('select-all', true)
    await wrapper.get('#replace-input').setValue('Spirit')
    await wrapper.vm.$nextTick()
    expect(resultComponent(wrapper).props('selectedMatchIds')).toEqual(
      new Set([match.id, secondMatch.id]),
    )

    resultComponent(wrapper).vm.$emit('replace-selected')
    await flushPromises()
    expect(service.replaceFindReplaceMatches).toHaveBeenCalledWith(
      expect.objectContaining({ matches: [match, secondMatch] }),
    )
    expect(resultComponent(wrapper).props('replacingDocumentId')).toBeNull()
  })

  it('undoes the last successful replacement with optimistic field guards', async () => {
    const { wrapper, service } = mountModal()
    await search(wrapper)
    await wrapper.get('#replace-input').setValue('Spirit')
    resultComponent(wrapper).vm.$emit('replace-match', match)
    await flushPromises()

    const undo = wrapper.findAll('button').find((button) => button.text() === 'Undo')
    await undo!.trigger('click')
    await flushPromises()

    expect(service.restoreFindReplaceFields).toHaveBeenCalledWith({
      targetType: 'chapter',
      targetId: 'chapter-1',
      expectedFields: { title: 'Spirit opening', text: 'Spirit story Ghost' },
      fields: document.fields,
    })
    expect(wrapper.emitted('refresh')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('Replaced 1 match')
  })

  it('keeps the undo available and reports a failed restore', async () => {
    const service = createService()
    service.restoreFindReplaceFields.mockRejectedValueOnce(new Error('document changed again'))
    const { wrapper } = mountModal(service)
    await search(wrapper)
    await wrapper.get('#replace-input').setValue('Spirit')
    resultComponent(wrapper).vm.$emit('replace-match', match)
    await flushPromises()

    await wrapper.findAll('button').find((button) => button.text() === 'Undo')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('document changed again')
    expect(wrapper.text()).toContain('Replaced 1 match in “Opening”.')
  })

  it('navigates to results and resets sensitive state when closed', async () => {
    const { wrapper } = mountModal()
    await search(wrapper)
    await wrapper.get('#replace-input').setValue('Spirit')

    resultComponent(wrapper).vm.$emit('navigate')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(routerMocks.push).toHaveBeenCalledWith('/books/book-1/chapters/chapter-1')

    await wrapper.setProps({ show: false })
    await flushPromises()
    await wrapper.setProps({ show: true })
    await flushPromises()
    expect((wrapper.get('#search-input').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('#replace-input').element as HTMLInputElement).value).toBe('')
  })

  it('navigates wiki results to the wiki route', async () => {
    const service = createService()
    service.findReplaceMatches.mockResolvedValueOnce([{
      ...document,
      targetType: 'wikiPage',
      targetId: 'wiki-1',
      displayName: 'Ghosts',
    }])
    const { wrapper } = mountModal(service)
    await search(wrapper)

    resultComponent(wrapper).vm.$emit('navigate')

    expect(routerMocks.push).toHaveBeenCalledWith('/books/book-1/wiki/wiki-1')
  })
})
