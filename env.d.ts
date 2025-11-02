/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_GOOGLE_CLIENT_ID_WEB?: string
  readonly VITE_GOOGLE_CLIENT_ID_NATIVE?: string
  readonly VITE_GOOGLE_REDIRECT_URI?: string
  readonly VITE_GOOGLE_REDIRECT_URI_NATIVE?: string
  readonly VITE_GOOGLE_CLIENT_SECRET?: string
  readonly VITE_AUTH0_DOMAIN: string
  readonly VITE_AUTH0_CLIENT_ID: string
  readonly VITE_AUTH0_AUDIENCE: string
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
