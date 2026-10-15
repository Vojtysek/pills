/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Default ntfy server offered for expiry reminders, e.g. https://ntfy.example.cz */
  readonly VITE_NTFY_URL?: string;
}
