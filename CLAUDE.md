# AI Beta Reader Vue Frontend - Claude Development Guide

## Project Overview
Vue.js 3 frontend for AI Beta Reader with Auth0 authentication, rich text editing, and AI-powered writing feedback.

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
├── auth/
│   └── index.ts              # Auth0 configuration
├── components/
│   ├── TextEditor.vue        # Rich markdown editor with toolbar
│   └── MarkdownRenderer.vue  # Syntax-highlighted markdown display
├── services/
│   └── api.ts               # Backend API client with auto JWT tokens
├── views/
│   ├── BooksView.vue        # Books listing and management
│   ├── BookView.vue         # Chapter listing for a book
│   ├── ChapterView.vue      # Chapter editing and AI review
│   └── CallbackView.vue     # Auth0 callback handler
├── router/
│   └── index.ts             # Vue Router with auth guards
├── App.vue                  # Main app with Auth0 integration
└── main.ts                  # App initialization
```

## Key Technologies
- **Vue 3** - Composition API
- **TypeScript** - Type safety
- **Vue Router** - Client-side routing
- **Pinia** - State management
- **Auth0 Vue** - Authentication
- **Tailwind CSS** - Styling
- **Headless UI** - Unstyled components
- **Heroicons** - Icon library
- **Axios** - HTTP client
- **Markdown-it** - Markdown parsing
- **Highlight.js** - Syntax highlighting

## Environment Variables
```bash
# Auth0 Configuration
VITE_AUTH0_DOMAIN=your-domain.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=https://your-domain.auth0.com/api/v2/

# Backend API
VITE_API_BASE_URL=http://localhost:3001
```

## Auth0 Setup
Configure in Auth0 dashboard:
- **Application Type**: Single Page Application
- **Allowed Callback URLs**: `http://localhost:5173/callback`
- **Allowed Logout URLs**: `http://localhost:5173`
- **Allowed Web Origins**: `http://localhost:5173`

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
- Automatic JWT token attachment
- Axios interceptors for auth
- Typed service functions for backend

## Routing & Auth Guards
- `/` - Redirects to `/books`
- `/books` - Books listing (protected)
- `/books/:id` - Chapter management (protected)
- `/books/:bookId/chapters/:chapterId` - Chapter editing (protected)
- `/callback` - Auth0 callback handler

All protected routes require authentication and redirect to Auth0 login.

## State Management
- **Books**: Stored in localStorage (temporary solution)
- **User**: Managed by Auth0 Vue plugin
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

### AI Features
- Generate chapter summaries with structured data
- Request AI reviews with different tones:
  - **FanFiction.net style**: Enthusiastic reader feedback
  - **Editorial**: Developmental editor notes
  - **Line notes**: Concrete line-level suggestions

## Common Tasks

### Adding New Views
1. Create Vue component in `src/views/`
2. Add route to `src/router/index.ts`
3. Use `meta: { requiresAuth: true }` for protected routes

### API Integration
```typescript
// Use existing services
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

### Testing Auth Flow
1. Click "Login" to authenticate with Auth0
2. Create a book and chapters
3. Generate summaries and reviews
4. Test different review tones

## Component Communication
- **Props down**: Parent to child data flow
- **Events up**: Child to parent communication
- **Router**: Navigate between views
- **API**: Persist data to backend

## Error Handling
- Auth errors redirect to login
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
- Integrated Auth0 authentication
- Added rich text editor with live preview
- Implemented AI review system with multiple tones
- Created responsive book and chapter management
- Added comprehensive error handling and loading states

## Future Enhancements
- Real-time collaboration
- Advanced text formatting options
- Export functionality (PDF, DOCX)
- Offline support with PWA
- Advanced AI customization options