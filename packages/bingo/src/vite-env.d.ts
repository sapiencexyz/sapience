/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ZERODEV_PROJECT_ID?: string;
  readonly VITE_SAPIENCE_API_URL?: string;
  /** Default BingoCard address; UI (localStorage) override still wins. */
  readonly VITE_BINGO_CONTRACT_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
