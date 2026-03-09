/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_GAMEY_URL?: string
  readonly VITE_USE_MSW?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
