import type { Component } from 'vue'
import { BookOpenIcon, SparklesIcon, Cog6ToothIcon } from '@heroicons/vue/24/outline'

export interface NavItem {
  to: string
  label: string
  icon: Component
  isActive: (path: string) => boolean
}

export const primaryNavItems: NavItem[] = [
  {
    to: '/books',
    label: 'Books',
    icon: BookOpenIcon,
    isActive: (path: string) => path.startsWith('/books')
  },
  {
    to: '/ai-profiles',
    label: 'AI Profiles',
    icon: SparklesIcon,
    isActive: (path: string) => path.startsWith('/ai-profiles')
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: Cog6ToothIcon,
    isActive: (path: string) => path.startsWith('/settings')
  }
]
