/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_STORAGE_EMULATOR_HOST?: string;
  readonly VITE_FIREBASE_STORAGE_EMULATOR_PORT?: string;
}

interface ImportMetaEnv {
  readonly VITE_FIREBASE_TARGET?: "emulator" | "production";
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_AUTH_ALIAS_DOMAIN: string;
  readonly VITE_FIREBASE_AUTH_EMULATOR_URL?: string;
  readonly VITE_FIRESTORE_EMULATOR_HOST?: string;
  readonly VITE_FIRESTORE_EMULATOR_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
