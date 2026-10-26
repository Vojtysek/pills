/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Push server (server/) for expiry notifications, e.g. https://lekarnicka-api.example.cz */
  readonly VITE_API_URL?: string;
}

interface Window {
  /** Matomo command queue, set up by the tracking snippet in index.html. */
  _paq?: unknown[][];
}
