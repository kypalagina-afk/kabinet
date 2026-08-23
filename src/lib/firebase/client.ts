import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

const requiredEnvironmentKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

function readFirebaseConfig() {
  const missingKeys = requiredEnvironmentKeys.filter((key) => !import.meta.env[key]);

  if (missingKeys.length > 0) {
    throw new Error(`Missing Firebase environment variables: ${missingKeys.join(", ")}`);
  }

  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

let services: FirebaseServices | null = null;

export function isUsingFirebaseEmulators(): boolean {
  return (import.meta.env.VITE_FIREBASE_TARGET ?? "emulator") === "emulator";
}

export function isProductionBackendAvailable(): boolean {
  return (
    !isUsingFirebaseEmulators() &&
    import.meta.env.VITE_PRODUCTION_BACKEND_ENABLED === "true" &&
    Boolean(import.meta.env.VITE_KABINET_API_BASE?.trim())
  );
}

export function isFirebaseStorageUploadAvailable(): boolean {
  return isUsingFirebaseEmulators() || isProductionBackendAvailable();
}

function createFirebaseServices(): FirebaseServices {
  const target = import.meta.env.VITE_FIREBASE_TARGET ?? "emulator";
  if (target !== "emulator" && target !== "production") {
    throw new Error("VITE_FIREBASE_TARGET must be emulator or production");
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(readFirebaseConfig());
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  if (target === "emulator") {
    const authEmulatorUrl =
      import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099";
    const firestoreHost =
      import.meta.env.VITE_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1";
    const firestorePort = Number(
      import.meta.env.VITE_FIRESTORE_EMULATOR_PORT ?? "8080",
    );

    if (!Number.isInteger(firestorePort) || firestorePort <= 0) {
      throw new Error("VITE_FIRESTORE_EMULATOR_PORT must be a valid port");
    }

    connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
    connectFirestoreEmulator(db, firestoreHost, firestorePort);
    const storageHost = import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1";
    const storagePort = Number(import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT ?? "9199");
    connectStorageEmulator(storage, storageHost, storagePort);
  }

  return { app, auth, db, storage };
}

function getFirebaseServices(): FirebaseServices {
  services ??= createFirebaseServices();
  return services;
}

export function getFirebaseApp(): FirebaseApp {
  return getFirebaseServices().app;
}

export function getFirebaseAuth(): Auth {
  return getFirebaseServices().auth;
}

export function getFirebaseDb(): Firestore {
  return getFirebaseServices().db;
}

export function getFirebaseStorage(): FirebaseStorage {
  return getFirebaseServices().storage;
}
