/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Push server (server/) for expiry notifications, e.g. https://lekarnicka-api.example.cz */
  readonly VITE_API_URL?: string;
}
