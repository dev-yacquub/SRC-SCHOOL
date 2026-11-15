import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { firebaseConfig } from "./firebase";

type AdminCache = {
  initialized: boolean;
  app: App | null;
  db: Firestore | null;
};

const globalForAdmin = globalThis as unknown as {
  __firebaseAdminCache?: AdminCache;
};

function parseServiceAccountFromEnv(): ServiceAccount | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (rawJson) {
    try {
      const decoded = rawJson.startsWith("{")
        ? rawJson
        : Buffer.from(rawJson, "base64").toString("utf8");
      const parsed = JSON.parse(decoded) as Record<string, string>;
      if (parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id || firebaseConfig.projectId,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch (err) {
      console.warn(
        "[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:",
        err
      );
    }
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (clientEmail && privateKey) {
    return {
      projectId:
        process.env.FIREBASE_PROJECT_ID?.trim() || firebaseConfig.projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

/**
 * Returns a Firebase Admin Firestore instance when service-account or ADC
 * credentials are present, or `null` so server routes can cleanly fall back to
 * the Firebase Web SDK configured for the project.
 */
export function getAdminFirestore(): Firestore | null {
  if (globalForAdmin.__firebaseAdminCache?.initialized) {
    return globalForAdmin.__firebaseAdminCache.db;
  }

  const cache: AdminCache = { initialized: true, app: null, db: null };
  try {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      cache.app = getApp();
      cache.db = getFirestore(cache.app);
      globalForAdmin.__firebaseAdminCache = cache;
      return cache.db;
    }

    const serviceAccount = parseServiceAccountFromEnv();
    if (serviceAccount) {
      cache.app = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId ?? firebaseConfig.projectId,
      });
      cache.db = getFirestore(cache.app);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
      cache.app = initializeApp({
        credential: applicationDefault(),
        projectId: firebaseConfig.projectId,
      });
      cache.db = getFirestore(cache.app);
    }
  } catch (err) {
    console.warn(
      "[firebase-admin] Admin SDK init failed, falling back to Firebase Web SDK:",
      err
    );
    cache.app = null;
    cache.db = null;
  }

  globalForAdmin.__firebaseAdminCache = cache;
  return cache.db;
}

export function getFirebaseSdkMode(): "admin-sdk" | "web-sdk" {
  return getAdminFirestore() ? "admin-sdk" : "web-sdk";
}

