/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPS_SENTRY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
