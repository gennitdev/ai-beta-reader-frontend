<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDatabase } from '@/composables/useDatabase'
import OrganizeHeader from '@/components/organize/OrganizeHeader.vue'
import OrganizePartsBoard from '@/components/organize/OrganizePartsBoard.vue'
import type { Book as DatabaseBook, BookPart } from '@/lib/database'
import type { Chapter, OrganizedPart, ChaptersByPart } from '@/types/organize'

const route = useRoute()
const router = useRouter()
const bookId = ref(route.params.bookId as string | undefined)

const requireBookId = () => {
  if (!bookId.value) {
    throw new Error('Book ID is not available')
  }
  return bookId.value
}

const {
  books,
  chapters: dbChapters,
  loadBooks,
  loadChapters,
  getSummary,
  getParts,
  createPart,
  updatePart,
  deletePart,
  updatePartOrder,
  updateChapterOrders,
} = useDatabase()

const book = ref<DatabaseBook | null>(null)
const chapters = ref<Chapter[]>([])
const parts = ref<BookPart[]>([])
const partOrder = ref<string[]>([])
const loading = ref(false)
const creatingPart = ref(false)
const creatingPartLoading = ref(false)
const newPartName = ref('')
const editingPartId = ref<string | null>(null)
const editingPartName = ref('')
const errorMessage = ref('')
const boardPartLists = ref<Record<string, Chapter[]>>({})
const boardUncategorized = ref<Chapter[]>([])

const sortedChapters = computed(() => {
  return chapters.value.slice().sort((a, b) => (a.position || 0) - (b.position || 0))
})

const totalWordCount = computed(() => {
  return chapters.value.reduce((total, chapter) => total + (chapter.word_count || 0), 0)
})

const totalWordCountLabel = computed(() => formatWordCount(totalWordCount.value))

const orderedParts = computed(() => {
  const partMap = new Map(parts.value.map((part) => [part.id, part]))
  const orderedList: BookPart[] = []

  partOrder.value.forEach((partId) => {
    const part = partMap.get(partId)
    if (part) {
      orderedList.push(part)
      partMap.delete(partId)
    }
  })

  if (partMap.size > 0) {
    const remaining = Array.from(partMap.values()).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    orderedList.push(...remaining)
  }

  return orderedList
})

const chaptersByPart = computed<ChaptersByPart>(() => {
  const partList = orderedParts.value

  const organizedParts: OrganizedPart[] = partList.map((part) => {
    const partChapters = boardPartLists.value[part.id] || []
    const wordCount = partChapters.reduce(
      (total, chapter) => total + (chapter.word_count || 0),
      0
    )

    return {
      ...part,
      chapters: partChapters,
      wordCount,
    }
  })

  const uncategorizedWordCount = boardUncategorized.value.reduce(
    (total, chapter) => total + (chapter.word_count || 0),
    0
  )

  return {
    parts: organizedParts,
    uncategorized: boardUncategorized.value,
    uncategorizedWordCount,
  }
})

const parseIdArray = (value: string | null | undefined): string[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const syncBoardLists = () => {
  const partIdSet = new Set<string>()
  const nextPartLists: Record<string, Chapter[]> = {}

  orderedParts.value.forEach((part) => {
    partIdSet.add(part.id)
    nextPartLists[part.id] = sortedChapters.value
      .filter((chapter) => chapter.part_id === part.id)
      .map((chapter) => chapter)
  })

  boardPartLists.value = nextPartLists

  boardUncategorized.value = sortedChapters.value
    .filter((chapter) => !chapter.part_id || !partIdSet.has(chapter.part_id))
    .map((chapter) => chapter)
}

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index])

const setPartOrderState = (newOrder: string[]) => {
  const uniqueOrder = Array.from(new Set(newOrder))
  partOrder.value = uniqueOrder
  if (book.value) {
    book.value.part_order = JSON.stringify(uniqueOrder)
  }
  syncBoardLists()
}

const syncPartOrderWithParts = async () => {
  if (!book.value) {
    partOrder.value = []
    return
  }

  const storedOrder = parseIdArray(book.value.part_order)
  const partIds = parts.value.map((part) => part.id)
  const sanitized = storedOrder.filter((id) => partIds.includes(id))
  const missing = parts.value
    .filter((part) => !sanitized.includes(part.id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((part) => part.id)

  const updatedOrder = [...sanitized, ...missing]

  if (!arraysEqual(updatedOrder, storedOrder)) {
    try {
      await updatePartOrder(requireBookId(), updatedOrder)
    } catch (error) {
      console.error('Failed to synchronize part order:', error)
    }
  }

  setPartOrderState(updatedOrder)
}

const persistPartOrder = async (newOrder: string[]) => {
  const uniqueOrder = Array.from(new Set(newOrder))
  if (arraysEqual(uniqueOrder, partOrder.value)) {
    return true
  }

  try {
    await updatePartOrder(requireBookId(), uniqueOrder)
    setPartOrderState(uniqueOrder)
    return true
  } catch (error) {
    console.error('Failed to update part order:', error)
    return false
  }
}

const buildChapterOrder = (partUpdates: Record<string, string[]>) => {
  const chapterOrder: string[] = []

  if (partUpdates['null']) {
    chapterOrder.push(...partUpdates['null'])
  }

  const visited = new Set<string>()
  partOrder.value.forEach((partId) => {
    visited.add(partId)
    if (partUpdates[partId]) {
      chapterOrder.push(...partUpdates[partId])
    }
  })

  Object.entries(partUpdates).forEach(([partId, chapterIds]) => {
    if (partId !== 'null' && !visited.has(partId)) {
      chapterOrder.push(...chapterIds)
    }
  })

  return chapterOrder
}

const formatWordCount = (count: number) => {
  if (count < 1000) return count.toString()
  return (count / 1000).toFixed(1) + 'k'
}

const loadData = async () => {
  try {
    loading.value = true
    errorMessage.value = ''

    const currentBookId = bookId.value
    if (!currentBookId) {
      router.push('/books')
      return
    }

    await loadBooks()

    book.value = (books.value.find((b) => b.id === currentBookId) as DatabaseBook | undefined) || null
    if (!book.value) {
      router.push('/books')
      return
    }

    await loadChapters(currentBookId)
    parts.value = await getParts(currentBookId)

    await syncPartOrderWithParts()

    const partNameMap = new Map<string, string>()
    parts.value.forEach((part) => {
      partNameMap.set(part.id, part.name)
    })

    const chapterPromises = dbChapters.value.map(async (ch: any, index: number) => {
      const summary = await getSummary(ch.id)
      return {
        id: ch.id,
        title: ch.title || null,
        word_count: Number(ch.word_count) || 0,
        has_summary: !!summary,
        summary: summary?.summary || null,
        position: index,
        position_in_part: null,
        part_id: ch.part_id || null,
        part_name: ch.part_id ? partNameMap.get(ch.part_id) || null : null,
      }
    })

    chapters.value = await Promise.all(chapterPromises)
    syncBoardLists()
  } catch (error) {
    console.error('Failed to load organize chapters data:', error)
    errorMessage.value = 'Unable to load chapters. Please try again.'
  } finally {
    loading.value = false
  }
}

const refresh = async () => {
  await loadData()
}

const gotoBook = () => {
  const targetId = bookId.value
  if (targetId) {
    router.push(`/books/${targetId}`)
  } else {
    router.push('/books')
  }
}

const startCreatingPart = () => {
  creatingPart.value = true
  newPartName.value = ''
}

const cancelCreatePart = () => {
  creatingPart.value = false
  newPartName.value = ''
}

const createPartFunc = async () => {
  if (!newPartName.value.trim() || creatingPartLoading.value) return

  try {
    creatingPartLoading.value = true
    await createPart(requireBookId(), newPartName.value.trim())
    creatingPart.value = false
    newPartName.value = ''
    await loadData()
  } catch (error) {
    console.error('Failed to create part:', error)
  } finally {
    creatingPartLoading.value = false
  }
}

const startEditingPart = (partId: string) => {
  const part =
    parts.value.find((p) => p.id === partId) ||
    orderedParts.value.find((p) => p.id === partId)

  if (!part) return

  editingPartId.value = part.id
  editingPartName.value = part.name
}

const cancelEditPart = () => {
  editingPartId.value = null
  editingPartName.value = ''
}

const savePart = async (partId: string) => {
  if (!editingPartName.value.trim()) return

  try {
    await updatePart(partId, editingPartName.value.trim())
    await loadData()
    editingPartId.value = null
    editingPartName.value = ''
  } catch (error) {
    console.error('Failed to update part:', error)
  }
}

const deletePartFunc = async (partId: string) => {
  if (
    !confirm(
      'Are you sure you want to delete this part? Chapters in this part will become uncategorized.'
    )
  ) {
    return
  }

  try {
    await deletePart(partId)
    await loadData()
  } catch (error) {
    console.error('Failed to delete part:', error)
  }
}

const saveChapterOrder = async () => {
  try {
    const partUpdates: Record<string, string[]> = {}

    partUpdates['null'] = chaptersByPart.value.uncategorized.map((c) => c.id)
    chaptersByPart.value.parts.forEach((part) => {
      partUpdates[part.id] = part.chapters.map((c) => c.id)
    })

    const chapterOrder = buildChapterOrder(partUpdates)
    await updateChapterOrders(requireBookId(), chapterOrder, partUpdates, partOrder.value)
    await loadData()
  } catch (error) {
    console.error('Failed to save chapter order:', error)
    await loadData()
  }
}

const moveChapterToPart = async (chapterId: string, partId: string | null) => {
  try {
    let movedChapter: Chapter | undefined

    // Remove from current list
    const sourceEntry = Object.entries(boardPartLists.value).find(([, list]) => {
      const index = list.findIndex((chapter) => chapter.id === chapterId)
      if (index !== -1) {
        movedChapter = list.splice(index, 1)[0]
        return true
      }
      return false
    })

    if (!movedChapter) {
      const index = boardUncategorized.value.findIndex((chapter) => chapter.id === chapterId)
      if (index !== -1) {
        movedChapter = boardUncategorized.value.splice(index, 1)[0]
      }
    }

    if (!movedChapter) {
      console.warn('Chapter not found when attempting to move:', chapterId)
      return
    }

    movedChapter.part_id = partId

    const targetList = partId
      ? (boardPartLists.value[partId] = boardPartLists.value[partId] || [])
      : boardUncategorized.value

    targetList.push(movedChapter)

    await saveChapterOrder()
  } catch (error) {
    console.error('Failed to move chapter to part:', error)
    await loadData()
  }
}

const moveChapterUp = async (chapterList: Chapter[], index: number) => {
  if (index === 0) return
  const temp = chapterList[index]
  chapterList[index] = chapterList[index - 1]
  chapterList[index - 1] = temp
  await saveChapterOrder()
}

const moveChapterDown = async (chapterList: Chapter[], index: number) => {
  if (index >= chapterList.length - 1) return
  const temp = chapterList[index]
  chapterList[index] = chapterList[index + 1]
  chapterList[index + 1] = temp
  await saveChapterOrder()
}

const movePart = async (partId: string, direction: 'up' | 'down') => {
  const currentIndex = partOrder.value.indexOf(partId)
  if (currentIndex === -1) return

  const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
  if (newIndex < 0 || newIndex >= partOrder.value.length) return

  const newOrder = [...partOrder.value]
  ;[newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]]

  const success = await persistPartOrder(newOrder)
  if (!success) {
    return
  }

  await saveChapterOrder()
}

const movePartUp = async (partId: string) => {
  await movePart(partId, 'up')
}

const movePartDown = async (partId: string) => {
  await movePart(partId, 'down')
}

const onChapterMove = () => {
  // Drag and drop reordering is finalized via the change handlers that call saveChapterOrder.
}

const handleNewPartNameUpdate = (value: string) => {
  newPartName.value = value
}

const handleEditingPartNameUpdate = (value: string) => {
  editingPartName.value = value
}

onMounted(async () => {
  if (!bookId.value) {
    router.push('/books')
    return
  }
  await loadData()
})

watch(
  () => route.params.bookId,
  async (newBookId, oldBookId) => {
    if (newBookId === oldBookId) return
    bookId.value = newBookId as string | undefined
    if (!bookId.value) {
      router.push('/books')
      return
    }
    await loadData()
  }
)
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <OrganizeHeader
        :book-title="book?.title ?? null"
        :chapters-count="chapters.length"
        :total-word-count-label="totalWordCountLabel"
        @back="gotoBook"
        @refresh="refresh"
      />

      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
        <OrganizePartsBoard
          :loading="loading"
          :error-message="errorMessage"
          :creating-part="creatingPart"
          :creating-part-loading="creatingPartLoading"
          :new-part-name="newPartName"
          :chapters-by-part="chaptersByPart"
          :part-order="partOrder"
          :editing-part-id="editingPartId"
          :editing-part-name="editingPartName"
          @start-create-part="startCreatingPart"
          @cancel-create-part="cancelCreatePart"
          @create-part="createPartFunc"
          @update:new-part-name="handleNewPartNameUpdate"
          @move-chapter-up="moveChapterUp"
          @move-chapter-down="moveChapterDown"
          @move-chapter-to-part="moveChapterToPart"
          @save-order="saveChapterOrder"
          @move-part-up="movePartUp"
          @move-part-down="movePartDown"
          @start-edit-part="startEditingPart"
          @update:editingPartName="handleEditingPartNameUpdate"
          @save-part="savePart"
          @cancel-edit-part="cancelEditPart"
          @delete-part="deletePartFunc"
        />
      </div>
    </div>
  </div>
</template>
