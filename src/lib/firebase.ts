import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    process.env.FIREBASE_PROJECT_ID ??
    "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
};

const globalForFirebase = globalThis as unknown as {
  __firestoreClientDb?: Firestore;
};

/**
 * Shared Firebase app instance safe for both browser and Next.js server bundles.
 */
export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

export function getClientFirestore(): Firestore {
  if (globalForFirebase.__firestoreClientDb) {
    return globalForFirebase.__firestoreClientDb;
  }

  const app = getFirebaseApp();
  let instance: Firestore;
  try {
    if (typeof window === "undefined") {
      // Force long-polling on Node.js SSR to avoid WebChannel drops under Next.js.
      instance = initializeFirestore(app, {
        experimentalForceLongPolling: true,
        ignoreUndefinedProperties: true,
      });
    } else {
      instance = getFirestore(app);
    }
  } catch {
    instance = getFirestore(app);
  }

  if (process.env.NODE_ENV !== "production") {
    globalForFirebase.__firestoreClientDb = instance;
  }
  return instance;
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getFirebaseStorage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}

let analyticsInstance: Analytics | null = null;
let analyticsInitPromise: Promise<Analytics | null> | null = null;

/**
 * Lazily initializes Firebase Analytics only in supported browser environments
 * so Next.js SSR and API routes never fail on `window` access.
 */
export async function initFirebaseAnalytics(): Promise<Analytics | null> {
  if (
    typeof window === "undefined" ||
    !firebaseConfig.apiKey ||
    !firebaseConfig.appId ||
    !firebaseConfig.measurementId
  ) {
    return null;
  }
  if (analyticsInstance) {
    return analyticsInstance;
  }
  if (!analyticsInitPromise) {
    analyticsInitPromise = isSupported()
      .then((supported) => {
        if (!supported) return null;
        analyticsInstance = getAnalytics(getFirebaseApp());
        return analyticsInstance;
      })
      .catch(() => null);
  }
  return analyticsInitPromise;
}
