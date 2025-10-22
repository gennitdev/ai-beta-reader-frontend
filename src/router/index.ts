import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue')
    },
    {
      path: '/docs',
      name: 'docs',
      component: () => import('../views/DocsView.vue')
    },
    {
      path: '/books',
      name: 'books',
      component: () => import('../views/BooksView.vue')
    },
    {
      path: '/books/:id',
      name: 'book',
      component: () => import('../views/BookView.vue'),
      children: [
        {
          path: 'chapters/:chapterId',
          name: 'book-chapter',
          component: () => import('../views/ChapterView.vue')
        },
        {
          path: 'wiki/:wikiPageId',
          name: 'book-wiki-page',
          component: () => import('../views/WikiPageView.vue')
        }
      ]
    },
    {
      path: '/books/:bookId/chapters/:chapterId',
      name: 'chapter-direct',
      component: () => import('../views/ChapterView.vue')
    },
    {
      path: '/books/:bookId/wiki/:wikiPageId',
      name: 'wiki-page-direct',
      component: () => import('../views/WikiPageView.vue')
    },
    {
      path: '/books/:bookId/chapter-editor',
      name: 'chapter-editor',
      component: () => import('../views/ChapterEditorView.vue')
    },
    {
      path: '/books/:bookId/chapter-editor/:chapterId',
      name: 'chapter-editor-edit',
      component: () => import('../views/ChapterEditorView.vue')
    },
    {
      path: '/books/:bookId/organize',
      name: 'organize-chapters',
      component: () => import('../views/OrganizeChaptersView.vue')
    },
    {
      path: '/books/:bookId/chapters/:chapterId',
      name: 'standalone-chapter',
      component: () => import('../views/ChapterView.vue')
    },
    {
      path: '/books/:bookId/wiki/:wikiPageId',
      name: 'standalone-wiki-page',
      component: () => import('../views/WikiPageView.vue')
    },
    {
      path: '/m/books/:bookId/chapters/:chapterId',
      name: 'mobile-chapter',
      component: () => import('../views/ChapterView.vue'),
      meta: { mobile: true }
    },
    {
      path: '/m/books/:bookId/wiki/:wikiPageId',
      name: 'mobile-wiki-page',
      component: () => import('../views/WikiPageView.vue'),
      meta: { mobile: true }
    },
    {
      path: '/ai-profiles/:id',
      name: 'ai-profile',
      component: () => import('../views/AIProfileView.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/UserSettingsView.vue')
    }
  ]
})

export default router
