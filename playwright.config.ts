import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/responsive",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_FIREBASE_TARGET: "emulator",
      VITE_FIREBASE_API_KEY: "demo-api-key",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-kabinet-25.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "demo-kabinet-25",
      VITE_FIREBASE_STORAGE_BUCKET: "demo-kabinet-25.appspot.com",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
      VITE_FIREBASE_APP_ID: "1:000000000000:web:demo",
      VITE_AUTH_ALIAS_DOMAIN: "kabinet25.example.com",
      VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
      VITE_FIRESTORE_EMULATOR_HOST: "127.0.0.1",
      VITE_FIRESTORE_EMULATOR_PORT: "8080",
      VITE_FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1",
      VITE_FIREBASE_STORAGE_EMULATOR_PORT: "9199",
    },
  },
});
