# AI Beta Reader Frontend

A Vue.js frontend for the AI Beta Reader application. Manage your books and chapters, edit content with a rich markdown editor, generate AI summaries, and get contextual feedback on your writing.

**Backend Repository:** [ai-beta-reader-backend](https://github.com/gennitdev/ai-beta-reader-backend)

## Features

- **Auth0 Authentication**: Secure login and user management
- **Book Management**: Create and organize your writing projects
- **Chapter Editor**: Rich markdown editor with live preview
- **AI Summaries**: Generate structured summaries for each chapter
- **AI Reviews**: Get contextual feedback with different tones:
  - Fan style (enthusiastic reader)
  - Editorial notes (developmental editor)
  - Line editor (concrete suggestions)
- **Responsive Design**: Works on desktop and mobile devices

## Prerequisites

- Node.js 18+
- Auth0 account configured
- AI Beta Reader Express backend running

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Copy `.env.local` and update with your values:
   ```bash
   VITE_AUTH0_DOMAIN=your-auth0-domain.auth0.com
   VITE_AUTH0_CLIENT_ID=your-auth0-client-id
   VITE_AUTH0_AUDIENCE=your-auth0-audience
   VITE_API_BASE_URL=http://localhost:3001
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

## Auth0 Configuration

In your Auth0 dashboard:

1. **Create a Single Page Application**
2. **Configure URLs:**
   - Allowed Callback URLs: `http://localhost:5173/callback`
   - Allowed Logout URLs: `http://localhost:5173`
   - Allowed Web Origins: `http://localhost:5173`

3. **Enable grants:**
   - Authorization Code
   - Refresh Token

## Usage

1. **Login** with Auth0
2. **Create a book** from the books page
3. **Add chapters** to your book
4. **Edit chapters** with the rich text editor
5. **Generate summaries** to track plot points and characters
6. **Get AI reviews** with contextual feedback

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint