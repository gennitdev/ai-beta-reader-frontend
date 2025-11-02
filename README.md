# AI Beta Reader Frontend

A Vue.js frontend for the AI Beta Reader application. Manage your books and chapters, edit content with a rich markdown editor, generate AI summaries, and get contextual feedback on your writing.

## Tech Stack

- **Frontend:** Vue.js 3 + TypeScript + Tailwind CSS
- **AI:** Powered by the ChatGPT API (GPT-4o Mini)
- **Sync:** Google Drive (PKCE with App Links)
- **Backend Repository:** [ai-beta-reader-backend](https://github.com/gennitdev/ai-beta-reader-backend)

## Features

### Core Writing Tools

- **Book Management**: Create and organize your writing projects with support for parts/sections
- **Chapter Editor**: Rich markdown editor with live preview and word count tracking
- **Responsive Design**: Works seamlessly on desktop and mobile devices

### AI-Powered Features

- **Smart Chapter Summaries**: Auto-generate structured summaries that track plot points, characters, and key events to maintain continuity across long manuscripts
- **Contextual AI Reviews**: Get intelligent feedback that understands your entire story:
  - Reviews use summaries of previous chapters as context
  - No need to explain backstory - the AI already knows what happened
  - Efficient token usage even for long manuscripts
- **Multiple Review Styles**:
  - Fan style (enthusiastic reader feedback)
  - Editorial notes (developmental editor perspective)
  - Line editor (concrete, actionable suggestions)
- **Custom AI Profiles**: Create personalized reviewer profiles with custom prompts to get the exact type of feedback you need

### Continuity Management

- **Interactive Character Sheets**: Auto-generated character profiles with smart linking between related characters
- **Wiki System**: Build a comprehensive story bible with interconnected pages for characters, locations, and concepts
- **Cross-Document Search**: Search across all chapters and wiki pages simultaneously
- **Find and Replace**: Make consistent changes across your entire manuscript with one click
- **Chapter Organization**: Drag-and-drop reordering with support for parts and uncategorized sections

## Screenshots

### AI Summary Generation

Clicking the generate summary button generates structured summaries that track characters, plot points, and key events for each chapter.

![Summary Being Generated](./src/assets/screenshots/summary-being-generated.png)

### Summary Management

You can manually edit or regenerate summaries to ensure they accurately capture the important details that will provide context for AI reviews.

![Manually Edit Summary](./src/assets/screenshots/manually-edit-summary.png)

![Regenerate Summary Button](./src/assets/screenshots/regenerate-summary-button.png)

### AI Review Transparency

The app shows you exactly what summaries are being sent to the AI as context, giving you full transparency into the review process.

![Review Summaries in Prompt](./src/assets/screenshots/review-summaries-in-prompt-to-see-if-summaries-need-editing.png)

### Contextual AI Feedback

Get intelligent feedback that understands your story's continuity and can catch inconsistencies across chapters.

![Example of Feedback on Consistency](./src/assets/screenshots/example-of-feedback-on-consistency-with-other-chapters.png)

### Custom AI Profiles

Create personalized reviewer profiles with custom prompts to get the exact type of feedback you need.

![Custom AI Profile Creation](./src/assets/screenshots/custom-ai-profile-creation.png)

![Custom AI Profile in User Settings](./src/assets/screenshots/custom-ai-profile-in-user-settings.png)

![Getting Feedback from Custom AI Profile](./src/assets/screenshots/getting-feedback-from-custom-ai-profile.png)

![Feedback by AI Profile](./src/assets/screenshots/feedback-by-ai-profile.png)

### Character Wiki System

Automatically generated character sheets that track relationships and development, with full edit history.

![Auto-generated Character Sheet with Change History](./src/assets/screenshots/auto-generated-character-sheet-with-change-history.png)

### Search and Replace for Continuity

Find and replace text across all chapters and wiki pages to maintain consistency throughout your manuscript.

![Search](./src/assets/screenshots/search.png)

![Find and Replace for Continuity Fixes](./src/assets/screenshots/find-and-replace-for-continuity-fixes.png)

## Prerequisites for Self Hosting Beta-bot

- Node.js 18+
- Google Cloud project with Drive API enabled and OAuth clients (web + Android)
- AI Beta Reader Express backend running

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env.local` and supply your Google OAuth web + Android client IDs. Adjust `VITE_API_BASE_URL` if you run a different backend origin.

3. **Start development server:**

   ```bash
   npm run dev
   ```

## Environment Variables

Create a `.env.local` file (or copy the example) and configure the following variables:

### Google OAuth (Drive sync)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth *web* client ID (used for browser GIS flow) | `302250506015-du7cd7e5g469dd74cs2fnq8luksiuutb.apps.googleusercontent.com` |
| `VITE_GOOGLE_CLIENT_ID_WEB` | Optional alias for the web client (defaults to `VITE_GOOGLE_CLIENT_ID`) | same as above |
| `VITE_GOOGLE_REDIRECT_URI` | Hosted redirect used by the web build | `https://www.beta-bot.net/oauth2redirect` |
| `VITE_GOOGLE_CLIENT_ID_NATIVE` | Android OAuth client ID (PKCE/native flow) | `…hmm4hpdloehtuodde00pu2irqkpm1inp.apps.googleusercontent.com` |
| `VITE_GOOGLE_REDIRECT_URI_NATIVE` | Custom redirect scheme from the Android client | `com.googleusercontent.apps.…:/oauth2redirect` |
| `VITE_GOOGLE_CLIENT_SECRET` | **Optional** – only required if you re-use the web client in native builds (not recommended) | `super-secret` |

### Backend API

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API base URL | `http://localhost:3001` |

### Notes

- All frontend environment variables must be prefixed with `VITE_`.
- `.env.local` is git-ignored; configure the same values in your hosting provider for production.

## How It Works

### Getting Started

1. **Create Your Book**: Start a new project and give it a title
2. **Write Your First Chapter**: Add content using the markdown editor
3. **Generate AI Summary**: Click "Generate Summary" to create a structured overview that tracks characters, plot points, and key events

### The Magic of Context

4. **Add More Chapters**: Continue writing your story
5. **Get Contextual Reviews**: When you generate a review for a new chapter, the AI automatically receives:
   - The full text of your current chapter
   - Summaries of all previous chapters
   - Character and plot information

   This means the AI understands your story's context without you having to explain anything!

6. **Maintain Continuity**: As your manuscript grows, the system efficiently manages context using summaries, preventing token limits while maintaining story awareness

### Advanced Features

7. **Custom AI Profiles**: Create personalized reviewer profiles with specific prompts tailored to your needs
8. **Build Your Story Bible**: Create wiki pages for characters, locations, and concepts
9. **Search and Replace**: Find names, places, or any text across all chapters and make consistent changes
10. **Organize with Parts**: Group chapters into parts or sections for better manuscript organization

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
