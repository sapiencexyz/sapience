/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'main' = Ethereal mainnet (production); anything else = staging. */
  readonly VITE_NETWORK?: string;
  readonly VITE_ZERODEV_PROJECT_ID?: string;
  readonly VITE_SAPIENCE_API_URL?: string;
  /** Default bingo backend URL; UI (localStorage) override still wins. */
  readonly VITE_BINGO_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
