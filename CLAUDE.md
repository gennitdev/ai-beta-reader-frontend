# AI Beta Reader Vue Frontend - Claude Development Guide

## Project Overview
Vue.js 3 frontend for AI Beta Reader with local-first storage, Google Drive backup/restore, rich text editing, and AI-powered writing feedback.

## Quick Start Commands
```bash
# Development
npm run dev

# Build
npm run build

# Preview production build
npm run preview

# Install dependencies
npm install

# Lint code
npm run lint
```

## Project Structure
```
src/
├── components/
│   ├── TextEditor.vue        # Rich markdown editor with toolbar
│   └── MarkdownRenderer.vue  # Syntax-highlighted markdown display
├── composables/
│   └── useDatabase.ts        # Local database + cloud sync orchestration
├── services/
│   └── api.ts               # Backend API client with auto JWT tokens
├── views/
│   ├── BooksView.vue        # Books listing and management
│   ├── BookView.vue         # Chapter listing for a book
│   ├── ChapterView.vue      # Chapter editing and AI review
├── router/
│   └── index.ts             # Vue Router setup
├── App.vue                  # Main shell layout, navigation, search, etc.
└── main.ts                  # App initialization
```

## Key Technologies
- **Vue 3** - Composition API
- **TypeScript** - Type safety
- **Vue Router** - Client-side routing
- **Pinia** - State management
- **Tailwind CSS** - Styling
- **Headless UI** - Unstyled components
- **Heroicons** - Icon library
- **Axios** - HTTP client
- **Markdown-it** - Markdown parsing
- **Highlight.js** - Syntax highlighting

## Environment Variables
```bash
# Google Drive sync (web + native)
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID_NATIVE=your-google-android-client-id.apps.googleusercontent.com
VITE_GOOGLE_REDIRECT_URI=https://www.beta-bot.net/oauth2redirect
VITE_GOOGLE_REDIRECT_URI_NATIVE=com.googleusercontent.apps.your-google-android-client-id:/oauth2redirect

# Optional: backend API base URL (defaults to http://localhost:3001)
VITE_API_BASE_URL=http://localhost:3001
```

## Key Components

### TextEditor.vue
- Rich markdown editor with live preview
- Formatting toolbar (bold, italic, headers, lists)
- Character counter and validation
- Tab interface for Write/Preview modes

### MarkdownRenderer.vue
- Syntax-highlighted code blocks
- Custom heading anchors
- Responsive image handling
- Dark mode support

### API Service (services/api.ts)
- Axios-based REST client for backend calls
- Typed service functions for backend
- Includes Google Drive sync helpers in `src/lib/`

## State Management
- **Books**: Stored in localStorage (temporary solution)
- **API Data**: Fetched on-demand from backend

## Key Features

### Book Management
- Create books with auto-generated IDs
- List user's books with chapter counts
- Navigate between books and chapters

### Chapter Editing
- Rich text editor with markdown support
- Live preview with syntax highlighting
- Word count tracking
- Auto-save capability

import { bookService, chapterService, reviewService } from '@/services/api'

// Create book
await bookService.createBook({ id: 'book-id', title: 'Book Title' })

// Generate review
await reviewService.generateReview({
  bookId: 'book-id',
  newChapterId: 'chapter-id',
  tone: 'fanficnet'
})
```

### Styling Guidelines
- Use Tailwind CSS utility classes
- Follow existing component patterns
- Support dark mode with `dark:` prefixes
- Use Heroicons for consistent iconography

## Development Workflow

### Local Development
1. Start backend: `cd ../ai-beta-reader-express && npm run dev`
2. Start frontend: `npm run dev`
3. Navigate to `http://localhost:5173`

### Testing Cloud Sync
1. Connect Android device with USB debugging enabled
2. Run `npm run build && npx cap sync android`
3. Launch the app and trigger a Google Drive backup & restore
4. Confirm AI summaries/reviews still function afterwards

## Component Communication
- **Props down**: Parent to child data flow
- **Events up**: Child to parent communication
- **Router**: Navigate between views
- **API**: Persist data to backend

## Error Handling
- Drive sync errors surface in the UI and console
- API errors show user-friendly messages
- Form validation with real-time feedback
- Loading states for async operations

## Performance Notes
- Components use `<script setup>` for optimal performance
- Lazy-loaded routes for code splitting
- Axios request interceptors handle auth automatically
- Markdown rendering optimized for large documents

## Styling System
- **Base**: Tailwind CSS utilities
- **Components**: Headless UI for accessibility
- **Icons**: Heroicons for consistency
- **Typography**: Prose classes for markdown content
- **Dark Mode**: Full support throughout app

## Recent Changes
- Added Google Drive PKCE authentication for native builds
- Added rich text editor with live preview
- Implemented AI review system with multiple tones
- Created responsive book and chapter management
- Added comprehensive error handling and loading states

## Future Enhancements
- Advanced text formatting options
- Export functionality (PDF, DOCX)
- Offline support with PWA
- Advanced AI customization options
