# AI Beta Reader Vue Frontend - Claude Development Guide

## Project Overview
Vue.js 3 frontend for AI Beta Reader with local-first SQLite storage, Google Drive backup/restore, rich text editing, AI-powered writing feedback, wiki pages for world-building, and Electron desktop support.

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

# Build and sync for Android
npm run build && npx cap sync android

# Run Electron desktop app
cd electron && npm run electron:start
```

## Project Structure
```
src/
├── components/
│   ├── book/                    # Book view components
│   │   ├── BookDesktopLayout.vue
│   │   ├── BookDesktopChapterListItem.vue
│   │   ├── BookMobileSection.vue
│   │   └── BookMobileChapterCard.vue
│   ├── chapter/                 # Chapter view components
│   │   ├── ChapterHeaderBar.vue
│   │   ├── ChapterStatusBar.vue
│   │   ├── ChapterContentSection.vue
│   │   ├── ChapterSummaryPanel.vue
│   │   ├── ChapterNotesPanel.vue
│   │   ├── ChapterReviewsSection.vue
│   │   ├── ChapterIllustrationsSection.vue
│   │   ├── ChapterHeroSection.vue
│   │   └── ConfirmDeleteModal.vue
│   ├── organize/                # Chapter organization components
│   │   ├── OrganizeHeader.vue
│   │   └── OrganizePartsBoard.vue
│   ├── images/
│   │   └── ImageLightbox.vue
│   ├── TextEditor.vue           # Rich markdown editor with toolbar
│   ├── MarkdownRenderer.vue     # Syntax-highlighted markdown display
│   ├── SearchModal.vue          # Search and replace across book
│   ├── CustomProfilesPanel.vue  # AI reviewer profile management
│   └── CloudSyncSettings.vue    # Google Drive sync UI
├── composables/
│   ├── useDatabase.ts           # Local SQLite database operations
│   ├── useImageLibrary.ts       # Image management (desktop only)
│   ├── useChapterImages.ts      # Chapter illustration handling
│   └── useBooks.ts              # Book list management
├── lib/
│   ├── database.ts              # SQLite database implementation
│   ├── openai.ts                # OpenAI API integration
│   ├── cloudSync.ts             # Google Drive backup/restore
│   ├── googleOAuth.ts           # OAuth authentication
│   ├── encryption.ts            # Data encryption utilities
│   └── tokenStorage.ts          # Auth token management
├── services/
│   └── api.ts                   # Backend API client
├── views/
│   ├── BooksView.vue            # Books listing and management
│   ├── BookView.vue             # Book detail with chapters/wiki/images
│   ├── ChapterView.vue          # Chapter reading and AI review
│   ├── ChapterEditorView.vue    # Chapter text editing
│   ├── WikiPageView.vue         # Wiki page viewing and editing
│   ├── PartView.vue             # Part/volume detail view
│   ├── OrganizeChaptersView.vue # Drag-and-drop chapter organization
│   ├── AIProfileView.vue        # Custom AI profile editing
│   ├── AIProfilesView.vue       # AI profiles listing
│   ├── UserSettingsView.vue     # User preferences and cloud sync
│   ├── DocsView.vue             # Documentation/help
│   └── HomeView.vue             # Landing page
├── types/
│   ├── bookView.ts              # Book view type definitions
│   └── organize.ts              # Organization types
├── router/
│   └── index.ts                 # Vue Router setup
├── App.vue                      # Main shell layout, navigation
└── main.ts                      # App initialization
```

## Key Technologies
- **Vue 3** - Composition API with `<script setup>`
- **TypeScript** - Type safety throughout
- **Vue Router** - Client-side routing with nested routes
- **Pinia** - State management
- **Tailwind CSS** - Utility-first styling with dark mode
- **Headless UI** - Accessible unstyled components
- **Heroicons** - Icon library
- **sql.js / @capacitor-community/sqlite** - Local SQLite database
- **OpenAI SDK** - AI summaries, reviews, and wiki generation
- **Capacitor** - Native mobile (Android) and desktop (Electron) builds
- **vuedraggable** - Drag and drop for chapter organization
- **Axios** - HTTP client for backend API
- **Markdown-it + Highlight.js** - Markdown parsing and syntax highlighting
- **crypto-js** - Data encryption for cloud sync
- **Vue Query** - Server state management

## Environment Variables
```bash
# Google Drive sync (web + native)
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID_NATIVE=your-google-android-client-id.apps.googleusercontent.com
VITE_GOOGLE_REDIRECT_URI=https://www.beta-bot.net/oauth2redirect
VITE_GOOGLE_REDIRECT_URI_NATIVE=com.googleusercontent.apps.your-google-android-client-id:/oauth2redirect

# Optional: backend API base URL (defaults to http://localhost:3001)
VITE_API_BASE_URL=http://localhost:3001

# Optional: enable wiki history feature
VITE_ENABLE_WIKI_HISTORY=true
```

## Data Storage
- **Primary**: Local SQLite database (sql.js in browser, native SQLite on mobile/desktop)
- **Cloud Backup**: Optional Google Drive sync with encryption
- **Images**: Stored locally in Electron desktop app only (not synced to cloud)

## Key Features

### Book Management
- Create and manage multiple books
- Book cover images (desktop only)
- Organize chapters into parts/volumes
- Drag-and-drop chapter reordering
- Search and replace across entire book

### Chapter Editing
- Rich text editor with markdown support
- Live preview with syntax highlighting
- Word count tracking
- Collapsible summary, notes, and illustrations panels

### AI-Powered Features
- **Summaries**: Auto-generate chapter summaries with POV, characters, and plot beats
- **Reviews**: Get AI feedback on chapters with customizable tone
- **Wiki Generation**: Auto-create character/location/concept pages from summaries
- **Custom AI Profiles**: Create personalized AI reviewers with specific personalities

### Wiki System
- Character, location, and concept pages
- Major/minor classification
- AI-generated or manually created
- Edit page names and content
- Delete pages with confirmation

### Chapter Illustrations (Desktop Only)
- Add multiple images per chapter
- Set chapter cover image
- Image lightbox viewer
- Download and delete images

### Parts/Volumes
- Group chapters into parts
- Part cover images
- Expand/collapse in sidebar
- Reorder parts and chapters within parts

## Component Patterns

### Prop-based Communication
Components receive data via props and emit events for changes:
```typescript
defineProps<{
  chapter: Chapter;
  isEditing: boolean;
}>();

const emit = defineEmits<{
  'save': [content: string];
  'cancel': [];
}>();
```

### Composables for Shared Logic
Database and image operations are abstracted into composables:
```typescript
const { books, loadBooks, saveBook, deleteWikiPage } = useDatabase();
const { fetchBookCover, pickNewBookCover } = useImageLibrary();
```

## Styling Guidelines
- Use Tailwind CSS utility classes
- Support dark mode with `dark:` prefixes
- Use Heroicons for consistent iconography
- Follow existing component patterns for consistency
- Collapsible panels use toggle buttons in status bars

## Development Workflow

### Local Development
1. Start backend: `cd ../ai-beta-reader-express && npm run dev`
2. Start frontend: `npm run dev`
3. Navigate to `http://localhost:5173`

### Testing Android Build
1. Connect Android device with USB debugging enabled
2. Run `npm run build && npx cap sync android`
3. Open Android Studio and run the app
4. Test Google Drive backup/restore and AI features

### Testing Electron Desktop
1. Run `npm run build`
2. `cd electron && npm run electron:start`
3. Test image features (only available in desktop)

## Error Handling
- Database errors surface in UI with user-friendly messages
- API errors show toast notifications
- Form validation with real-time feedback
- Loading states for all async operations
- Confirmation modals for destructive actions (delete chapter, wiki page, etc.)

## Performance Notes
- Components use `<script setup>` for optimal performance
- Lazy-loaded routes for code splitting
- SQLite queries are optimized with proper indexing
- Images loaded on-demand with thumbnails in lists
- Large chapter text truncated in previews
