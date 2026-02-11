/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_ONECLICK_BASE_URL?: string;
  readonly VITE_ONECLICK_JWT?: string;
  readonly VITE_SLIPPAGE_BPS?: string;
  readonly VITE_QUOTE_EXPIRY_MINUTES?: string;
  readonly VITE_POLL_INTERVAL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
