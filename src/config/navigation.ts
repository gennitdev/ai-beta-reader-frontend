import type { Component } from 'vue'
import {
  BookOpenIcon,
  SparklesIcon,
  Cog6ToothIcon,
  CircleStackIcon,
  DocumentTextIcon,
  InformationCircleIcon,
  MusicalNoteIcon,
} from '@heroicons/vue/24/outline'

export interface NavItem {
  to: string
  label: string
  icon: Component
  featured?: boolean
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
    to: '/bardwall',
    label: 'Bardwall',
    icon: MusicalNoteIcon,
    featured: true,
    isActive: (path: string) => path.startsWith('/bardwall')
  },
  {
    to: '/docs',
    label: 'Screenshots & Tutorial',
    icon: DocumentTextIcon,
    isActive: (path: string) => path.startsWith('/docs')
  },
  {
    to: '/',
    label: 'About Beta Bot',
    icon: InformationCircleIcon,
    isActive: (path: string) => path === '/'
  },
  {
    to: '/library-data',
    label: 'Library Data',
    icon: CircleStackIcon,
    isActive: (path: string) => path.startsWith('/library-data')
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: Cog6ToothIcon,
    isActive: (path: string) => path.startsWith('/settings')
  }
]

export function getPrimaryNavItems(bardwallEnabled = true): NavItem[] {
  return primaryNavItems.filter((item) => bardwallEnabled || item.to !== '/bardwall')
}
