import crypto from "node:crypto";
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore";
import { FieldPath, type Firestore as AdminFirestore } from "firebase-admin/firestore";
import { firebaseConfig, getClientFirestore } from "./firebase";
import { getAdminFirestore } from "./firebase-admin";

export type DbRecord = Record<string, unknown> & { id: string };

export type PushdownFilter =
  | { field: string; op: "=="; value: unknown }
  | { field: string; op: "in"; value: unknown[] };

export type BatchOperation =
  | { type: "set"; col: string; id: string; data: DbRecord }
  | { type: "delete"; col: string; id: string };

/**
 * Generates a unique URL-safe identifier compatible with Prisma `cuid()` IDs.
 */
export function generateId(): string {
  const ts = Date.now().toString(36).padStart(9, "0");
  const rand = crypto.randomBytes(10).toString("base64url").slice(0, 14);
  return `c${ts}${rand}`;
}

function isTimestampLike(val: unknown): val is { toDate: () => Date } {
  return (
    val !== null &&
    typeof val === "object" &&
    typeof (val as { toDate?: unknown }).toDate === "function"
  );
}

/**
 * Recursively normalizes values returned by Firestore (converting Timestamps to Date).
 */
export function fromFirestoreValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val;
  if (isTimestampLike(val)) {
    return val.toDate();
  }
  if (Array.isArray(val)) {
    return val.map(fromFirestoreValue);
  }
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return val;
}

/**
 * Converts a normalized record into a Firestore-safe plain object (stripping `undefined` and `id`).
 */
export function toFirestorePayload(record: DbRecord): Record<string, unknown> {
  const stripUndefined = (val: unknown): unknown => {
    if (val === undefined) return undefined;
    if (val === null || val instanceof Date) return val;
    if (Array.isArray(val)) {
      return val.map(stripUndefined).filter((item) => item !== undefined);
    }
    if (typeof val === "object") {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        const next = stripUndefined(v);
        if (next !== undefined) cleaned[k] = next;
      }
      return cleaned;
    }
    return val;
  };

  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === "id") continue;
    const cleaned = stripUndefined(v);
    if (cleaned !== undefined) payload[k] = cleaned;
  }
  return payload;
}

function mapDoc(id: string, raw: Record<string, unknown> | undefined): DbRecord | null {
  if (!raw) return null;
  const converted = fromFirestoreValue(raw) as Record<string, unknown>;
  return { ...converted, id };
}

function wrapFirestoreError(err: unknown, context: string): Error {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";

  if (
    code.includes("permission-denied") ||
    message.includes("PERMISSION_DENIED") ||
    message.includes("Missing or insufficient permissions") ||
    message.includes("Cloud Firestore API has not been used")
  ) {
    return new Error(
      `Cloud Firestore permission/API error (${context}) on project "${firebaseConfig.projectId}": ` +
        `1) Enable Cloud Firestore API & create the Firestore database in Firebase Console (` +
        `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore), and ` +
        `2) Add FIREBASE_SERVICE_ACCOUNT_KEY (or Test Mode rules during local dev).`
    );
  }
  if (
    message.includes("client is offline") ||
    code.includes("unavailable") ||
    message.includes("UNAVAILABLE")
  ) {
    return new Error(
      `Could not reach Cloud Firestore (${context}) for project "${firebaseConfig.projectId}". ` +
        `Verify Cloud Firestore API is enabled (` +
        `https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=${firebaseConfig.projectId}` +
        `), Firestore Database is created in Firebase Console, and internet access is available.`
    );
  }
  if (
    message.includes("NOT_FOUND") &&
    message.includes("database") &&
    message.includes("does not exist")
  ) {
    return new Error(
      `Cloud Firestore database is not enabled yet in Firebase project "${firebaseConfig.projectId}". ` +
        `Open Firebase Console -> Build -> Firestore Database -> Create database.`
    );
  }
  return err instanceof Error ? err : new Error(message);
}

function isFailedPrecondition(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";
  return code.includes("failed-precondition") || msg.includes("FAILED_PRECONDITION");
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchAllFromAdmin(
  adminDb: AdminFirestore,
  colName: string
): Promise<DbRecord[]> {
  const snap = await adminDb.collection(colName).get();
  return snap.docs
    .map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))
    .filter((d): d is DbRecord => d !== null);
}

async function fetchAllFromClient(colName: string): Promise<DbRecord[]> {
  const snap = await getDocs(collection(getClientFirestore(), colName));
  return snap.docs
    .map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))
    .filter((d): d is DbRecord => d !== null);
}

export async function getFirestoreDocById(
  colName: string,
  id: string
): Promise<DbRecord | null> {
  if (!id) return null;
  try {
    const adminDb = getAdminFirestore();
    if (adminDb) {
      const snap = await adminDb.collection(colName).doc(id).get();
      if (!snap.exists) return null;
      return mapDoc(snap.id, snap.data() as Record<string, unknown>);
    }
    const snap = await getDoc(doc(getClientFirestore(), colName, id));
    if (!snap.exists()) return null;
    return mapDoc(snap.id, snap.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapFirestoreError(err, `get ${colName}/${id}`);
  }
}

/**
 * Queries a collection using at most one selective equality/IN pushdown filter
 * so fresh Firestore databases work reliably via single-field auto-indexes.
 */
export async function queryFirestoreCollection(
  colName: string,
  pushdown?: PushdownFilter
): Promise<DbRecord[]> {
  try {
    const adminDb = getAdminFirestore();

    if (!pushdown) {
      return adminDb
        ? await fetchAllFromAdmin(adminDb, colName)
        : await fetchAllFromClient(colName);
    }

    if (pushdown.field === "id") {
      if (pushdown.op === "==") {
        if (typeof pushdown.value !== "string" || !pushdown.value) return [];
        const single = await getFirestoreDocById(colName, pushdown.value);
        return single ? [single] : [];
      }
      const ids = Array.from(
        new Set(pushdown.value.filter((v): v is string => typeof v === "string" && v.length > 0))
      );
      if (ids.length === 0) return [];
      if (ids.length === 1) {
        const single = await getFirestoreDocById(colName, ids[0]);
        return single ? [single] : [];
      }
      const results: DbRecord[] = [];
      for (const batchIds of chunkArray(ids, 30)) {
        if (adminDb) {
          const snap = await adminDb
            .collection(colName)
            .where(FieldPath.documentId(), "in", batchIds)
            .get();
          for (const d of snap.docs) {
            const mapped = mapDoc(d.id, d.data() as Record<string, unknown>);
            if (mapped) results.push(mapped);
          }
        } else {
          const q = query(
            collection(getClientFirestore(), colName),
            where(documentId(), "in", batchIds)
          );
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            const mapped = mapDoc(d.id, d.data() as Record<string, unknown>);
            if (mapped) results.push(mapped);
          }
        }
      }
      return results;
    }

    if (pushdown.op === "in") {
      const vals = pushdown.value.filter((v) => v !== undefined);
      if (vals.length === 0) return [];
      const results: DbRecord[] = [];
      try {
        for (const chunk of chunkArray(vals, 30)) {
          if (adminDb) {
            const snap = await adminDb
              .collection(colName)
              .where(pushdown.field, "in", chunk)
              .get();
            for (const d of snap.docs) {
              const mapped = mapDoc(d.id, d.data() as Record<string, unknown>);
              if (mapped) results.push(mapped);
            }
          } else {
            const q = query(
              collection(getClientFirestore(), colName),
              where(pushdown.field, "in", chunk)
            );
            const snap = await getDocs(q);
            for (const d of snap.docs) {
              const mapped = mapDoc(d.id, d.data() as Record<string, unknown>);
              if (mapped) results.push(mapped);
            }
          }
        }
        return results;
      } catch (err) {
        if (isFailedPrecondition(err)) {
          return adminDb
            ? await fetchAllFromAdmin(adminDb, colName)
            : await fetchAllFromClient(colName);
        }
        throw err;
      }
    }

    try {
      if (adminDb) {
        const snap = await adminDb
          .collection(colName)
          .where(pushdown.field, "==", pushdown.value)
          .get();
        return snap.docs
          .map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))
          .filter((d): d is DbRecord => d !== null);
      }
      const constraint: QueryConstraint = where(pushdown.field, "==", pushdown.value);
      const snap = await getDocs(query(collection(getClientFirestore(), colName), constraint));
      return snap.docs
        .map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))
        .filter((d): d is DbRecord => d !== null);
    } catch (err) {
      if (isFailedPrecondition(err)) {
        return adminDb
          ? await fetchAllFromAdmin(adminDb, colName)
          : await fetchAllFromClient(colName);
      }
      throw err;
    }
  } catch (err) {
    throw wrapFirestoreError(err, `query ${colName}`);
  }
}

export async function setFirestoreDoc(
  colName: string,
  id: string,
  data: DbRecord
): Promise<void> {
  const payload = toFirestorePayload(data);
  try {
    const adminDb = getAdminFirestore();
    if (adminDb) {
      await adminDb.collection(colName).doc(id).set(payload);
      return;
    }
    await setDoc(doc(getClientFirestore(), colName, id), payload);
  } catch (err) {
    throw wrapFirestoreError(err, `set ${colName}/${id}`);
  }
}

export async function deleteFirestoreDoc(colName: string, id: string): Promise<void> {
  try {
    const adminDb = getAdminFirestore();
    if (adminDb) {
      await adminDb.collection(colName).doc(id).delete();
      return;
    }
    await deleteDoc(doc(getClientFirestore(), colName, id));
  } catch (err) {
    throw wrapFirestoreError(err, `delete ${colName}/${id}`);
  }
}

export async function commitFirestoreBatch(ops: BatchOperation[]): Promise<void> {
  if (ops.length === 0) return;
  try {
    const adminDb = getAdminFirestore();
    // Firestore enforces a hard limit of 500 operations per WriteBatch.
    for (const chunk of chunkArray(ops, 450)) {
      if (adminDb) {
        const batch = adminDb.batch();
        for (const op of chunk) {
          const ref = adminDb.collection(op.col).doc(op.id);
          if (op.type === "set") {
            batch.set(ref, toFirestorePayload(op.data));
          } else {
            batch.delete(ref);
          }
        }
        await batch.commit();
      } else {
        const clientDb = getClientFirestore();
        const batch = writeBatch(clientDb);
        for (const op of chunk) {
          const ref = doc(clientDb, op.col, op.id);
          if (op.type === "set") {
            batch.set(ref, toFirestorePayload(op.data));
          } else {
            batch.delete(ref);
          }
        }
        await batch.commit();
      }
    }
  } catch (err) {
    throw wrapFirestoreError(err, "commit batch");
  }
}

