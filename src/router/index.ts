import { createRouter, createWebHistory } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      redirect: '/books'
    },
    {
      path: '/callback',
      name: 'callback',
      component: () => import('../views/CallbackView.vue')
    },
    {
      path: '/books',
      name: 'books',
      component: () => import('../views/BooksView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/books/:id',
      name: 'book',
      component: () => import('../views/BookView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/books/:bookId/chapter-editor',
      name: 'chapter-editor',
      component: () => import('../views/ChapterEditorView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/books/:bookId/chapters/:chapterId',
      name: 'chapter',
      component: () => import('../views/ChapterView.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

// Auth guard
router.beforeEach(async (to, from, next) => {
  const { isLoading, isAuthenticated, loginWithRedirect } = useAuth0()

  // Skip auth check for callback route
  if (to.path === '/callback') {
    next()
    return
  }

  // Wait for Auth0 to finish loading
  if (isLoading.value) {
    // Wait a bit for Auth0 to initialize
    let attempts = 0
    while (isLoading.value && attempts < 50) { // Max 5 seconds
      await new Promise(resolve => setTimeout(resolve, 100))
      attempts++
    }

    // If still loading after timeout, proceed anyway
    if (isLoading.value) {
      console.warn('Auth0 still loading after timeout, proceeding with navigation')
      next()
      return
    }
  }

  // If route requires auth and user is not authenticated
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    try {
      await loginWithRedirect({
        appState: {
          target: to.fullPath
        }
      })
    } catch (error) {
      console.error('Auth0 login redirect failed:', error)
      // Continue with navigation to prevent blocking
      next()
    }
    return
  }

  next()
})

export default router