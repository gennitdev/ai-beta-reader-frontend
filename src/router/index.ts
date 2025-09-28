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

  // Wait for Auth0 to finish loading
  if (isLoading.value) {
    // You might want to show a loading spinner here
    setTimeout(() => router.beforeEach, 100)
    return
  }

  // If route requires auth and user is not authenticated
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    loginWithRedirect({
      appState: {
        target: to.fullPath
      }
    })
    return
  }

  next()
})

export default router