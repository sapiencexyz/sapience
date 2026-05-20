/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ZERODEV_PROJECT_ID?: string;
  readonly VITE_SAPIENCE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
