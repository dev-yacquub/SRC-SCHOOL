import type { PrismaClient } from "@prisma/client";
import {
  commitFirestoreBatch,
  generateId,
  getFirestoreDocById,
  queryFirestoreCollection,
  type BatchOperation,
  type DbRecord,
  type PushdownFilter,
} from "./firestore-backend";
import { ALL_MODELS, MODEL_DEFS, type ModelName, type RelationDef } from "./firestore-schema";

const RUN_WITH_TX = Symbol("runWithTx");

type WhereObj = Record<string, unknown>;
type OrderByInput = Record<string, unknown> | Record<string, unknown>[];
type SelectOrInclude = Record<string, unknown>;

interface QuerySession {
  tx?: TxOverlay;
  byIdCache: Map<ModelName, Map<string, DbRecord | null>>;
  fkCache: Map<string, Map<string, DbRecord[]>>;
  allCache: Map<ModelName, DbRecord[]>;
}

interface TxOverlay {
  writes: Map<ModelName, Map<string, DbRecord>>;
  deletes: Map<ModelName, Set<string>>;
  baseCollectionCache: Map<string, DbRecord[]>;
  baseIdCache: Map<string, DbRecord | null>;
  commit: () => Promise<void>;
}

function createSession(tx?: TxOverlay): QuerySession {
  return {
    tx,
    byIdCache: new Map(),
    fkCache: new Map(),
    allCache: new Map(),
  };
}

function invalidateSessionModel(session: QuerySession, model: ModelName) {
  session.byIdCache.delete(model);
  session.allCache.delete(model);
  for (const key of Array.from(session.fkCache.keys())) {
    if (key.startsWith(`${model}:`)) {
      session.fkCache.delete(key);
    }
  }
}

function createTxOverlay(): TxOverlay {
  const writes = new Map<ModelName, Map<string, DbRecord>>();
  const deletes = new Map<ModelName, Set<string>>();

  return {
    writes,
    deletes,
    baseCollectionCache: new Map(),
    baseIdCache: new Map(),
    async commit() {
      const ops: BatchOperation[] = [];
      for (const [model, delIds] of deletes.entries()) {
        const col = MODEL_DEFS[model].collection;
        for (const id of delIds) {
          ops.push({ type: "delete", col, id });
        }
      }
      for (const [model, writeMap] of writes.entries()) {
        const col = MODEL_DEFS[model].collection;
        const delIds = deletes.get(model);
        for (const [id, rec] of writeMap.entries()) {
          if (delIds?.has(id)) continue;
          ops.push({ type: "set", col, id, data: rec });
        }
      }
      await commitFirestoreBatch(ops);
    },
  };
}

function cloneValue<T>(val: T): T {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return new Date(val.getTime()) as unknown as T;
  if (Array.isArray(val)) return val.map(cloneValue) as unknown as T;
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = cloneValue(v);
    }
    return out as T;
  }
  return val;
}

function toComparable(val: unknown): number | string | boolean | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.getTime();
  if (typeof val === "number" || typeof val === "string" || typeof val === "boolean") {
    return val;
  }
  return String(val);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (a instanceof Date && typeof b === "string") {
    return a.getTime() === new Date(b).getTime();
  }
  if (b instanceof Date && typeof a === "string") {
    return new Date(a).getTime() === b.getTime();
  }
  return false;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return (
    val !== null &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    !(val instanceof Date)
  );
}

function matchesPushdown(rec: DbRecord, filter: PushdownFilter): boolean {
  if (filter.op === "==") {
    return valuesEqual(rec[filter.field], filter.value);
  }
  return filter.value.some((v) => valuesEqual(rec[filter.field], v));
}

function applyTxOverlay(
  model: ModelName,
  baseDocs: DbRecord[],
  tx: TxOverlay | undefined,
  pushdown?: PushdownFilter
): DbRecord[] {
  if (!tx) return baseDocs;
  const delIds = tx.deletes.get(model);
  const writeMap = tx.writes.get(model);
  const byId = new Map<string, DbRecord>();

  for (const doc of baseDocs) {
    if (delIds?.has(doc.id)) continue;
    byId.set(doc.id, doc);
  }

  if (writeMap) {
    for (const [id, rec] of writeMap.entries()) {
      if (delIds?.has(id)) continue;
      if (!pushdown || matchesPushdown(rec, pushdown)) {
        byId.set(id, cloneValue(rec));
      } else {
        byId.delete(id);
      }
    }
  }

  return Array.from(byId.values());
}

function pushdownCacheKey(model: ModelName, pushdown?: PushdownFilter): string {
  if (!pushdown) return `${model}:*`;
  return `${model}:${pushdown.field}:${pushdown.op}:${JSON.stringify(pushdown.value)}`;
}

function hydrateRecordDefaults(model: ModelName, doc: DbRecord): DbRecord {
  const defaults = MODEL_DEFS[model].defaults;
  if (!defaults) return doc;
  let next: DbRecord | null = null;
  for (const [k, v] of Object.entries(defaults)) {
    if (doc[k] === undefined) {
      if (!next) next = { ...doc };
      next[k] = cloneValue(v);
    }
  }
  return next ?? doc;
}

async function fetchModelDocs(
  model: ModelName,
  session: QuerySession,
  pushdown?: PushdownFilter
): Promise<DbRecord[]> {
  if (!pushdown) {
    const cachedAll = session.allCache.get(model);
    if (cachedAll) return cachedAll;
  }

  const col = MODEL_DEFS[model].collection;
  const txKey = pushdownCacheKey(model, pushdown);
  let baseDocs: DbRecord[];

  if (session.tx) {
    const cachedTxBase = session.tx.baseCollectionCache.get(txKey);
    if (cachedTxBase) {
      baseDocs = cachedTxBase;
    } else if (session.tx.baseCollectionCache.has(`${model}:*`)) {
      const allBase = session.tx.baseCollectionCache.get(`${model}:*`)!;
      baseDocs = pushdown
        ? allBase.filter((rec) => matchesPushdown(rec, pushdown))
        : allBase;
    } else {
      const fetched = await queryFirestoreCollection(col, pushdown);
      baseDocs = fetched.map((d) => hydrateRecordDefaults(model, d));
      session.tx.baseCollectionCache.set(txKey, baseDocs);
      for (const doc of baseDocs) {
        session.tx.baseIdCache.set(`${model}:${doc.id}`, doc);
      }
    }
  } else {
    const fetched = await queryFirestoreCollection(col, pushdown);
    baseDocs = fetched.map((d) => hydrateRecordDefaults(model, d));
  }

  const docs = applyTxOverlay(model, baseDocs, session.tx, pushdown);

  let idMap = session.byIdCache.get(model);
  if (!idMap) {
    idMap = new Map();
    session.byIdCache.set(model, idMap);
  }
  for (const doc of docs) {
    idMap.set(doc.id, doc);
  }

  if (!pushdown) {
    session.allCache.set(model, docs);
  }
  return docs;
}

async function fetchDocById(
  model: ModelName,
  id: string,
  session: QuerySession
): Promise<DbRecord | null> {
  if (!id) return null;

  const delIds = session.tx?.deletes.get(model);
  if (delIds?.has(id)) return null;

  const txWrite = session.tx?.writes.get(model)?.get(id);
  if (txWrite) return cloneValue(txWrite);

  let idMap = session.byIdCache.get(model);
  if (idMap?.has(id)) {
    return idMap.get(id) ?? null;
  }

  const txIdKey = `${model}:${id}`;
  let doc: DbRecord | null;
  if (session.tx && session.tx.baseIdCache.has(txIdKey)) {
    doc = session.tx.baseIdCache.get(txIdKey) ?? null;
  } else {
    const rawDoc = await getFirestoreDocById(MODEL_DEFS[model].collection, id);
    doc = rawDoc ? hydrateRecordDefaults(model, rawDoc) : null;
    if (session.tx) {
      session.tx.baseIdCache.set(txIdKey, doc);
    }
  }

  if (!idMap) {
    idMap = new Map();
    session.byIdCache.set(model, idMap);
  }
  idMap.set(id, doc);
  return doc;
}

async function fetchDocsByIds(
  model: ModelName,
  ids: string[],
  session: QuerySession
): Promise<void> {
  let idMap = session.byIdCache.get(model);
  if (!idMap) {
    idMap = new Map();
    session.byIdCache.set(model, idMap);
  }

  const missing: string[] = [];
  for (const id of new Set(ids)) {
    if (!id) continue;
    if (session.tx?.deletes.get(model)?.has(id)) {
      idMap.set(id, null);
      continue;
    }
    const txRec = session.tx?.writes.get(model)?.get(id);
    if (txRec) {
      idMap.set(id, cloneValue(txRec));
      continue;
    }
    if (!idMap.has(id)) {
      missing.push(id);
    }
  }

  if (missing.length === 0) return;

  const docs = await fetchModelDocs(model, session, {
    field: "id",
    op: "in",
    value: missing,
  });
  const foundIds = new Set(docs.map((d) => d.id));
  for (const m of missing) {
    if (!foundIds.has(m)) {
      idMap.set(m, null);
    }
  }
}

async function fetchDocsByForeignKey(
  targetModel: ModelName,
  fkField: string,
  parentIds: string[],
  session: QuerySession
): Promise<void> {
  const cacheKey = `${targetModel}:${fkField}`;
  let fkMap = session.fkCache.get(cacheKey);
  if (!fkMap) {
    fkMap = new Map();
    session.fkCache.set(cacheKey, fkMap);
  }

  const missing = Array.from(new Set(parentIds)).filter(
    (id) => id && !fkMap!.has(id)
  );
  if (missing.length === 0) return;

  for (const id of missing) {
    fkMap.set(id, []);
  }

  const children = await fetchModelDocs(targetModel, session, {
    field: fkField,
    op: "in",
    value: missing,
  });

  for (const child of children) {
    const parentId = child[fkField];
    if (typeof parentId === "string" && fkMap.has(parentId)) {
      fkMap.get(parentId)!.push(child);
    }
  }
}

async function getRelatedChildren(
  rel: RelationDef,
  parentId: string,
  session: QuerySession
): Promise<DbRecord[]> {
  const cacheKey = `${rel.targetModel}:${rel.fk}`;
  let fkMap = session.fkCache.get(cacheKey);
  if (!fkMap?.has(parentId)) {
    await fetchDocsByForeignKey(rel.targetModel, rel.fk, [parentId], session);
    fkMap = session.fkCache.get(cacheKey);
  }
  return fkMap?.get(parentId) ?? [];
}

/**
 * Extracts at most one high-selectivity pushdown filter for Firestore so single-field
 * auto-indexes handle all queries without requiring custom composite indexes.
 */
function selectPushdownFilter(
  model: ModelName,
  where?: WhereObj
): PushdownFilter | undefined {
  if (!where) return undefined;
  const def = MODEL_DEFS[model];
  const candidates: { priority: number; filter: PushdownFilter }[] = [];

  const inspectObject = (obj: WhereObj) => {
    for (const [k, rawVal] of Object.entries(obj)) {
      if (rawVal === undefined) continue;
      if (k === "AND") {
        const list = Array.isArray(rawVal) ? rawVal : [rawVal];
        for (const item of list) {
          if (isPlainObject(item)) inspectObject(item);
        }
        continue;
      }
      if (k === "OR" || k === "NOT" || def.relations[k]) continue;

      if (def.compoundUniques?.[k] && isPlainObject(rawVal)) {
        const fields = def.compoundUniques[k];
        if (fields[0] && rawVal[fields[0]] !== undefined) {
          candidates.push({
            priority: 1,
            filter: { field: fields[0], op: "==", value: rawVal[fields[0]] },
          });
        }
        continue;
      }

      if (k === "id") {
        if (typeof rawVal === "string") {
          candidates.push({ priority: 0, filter: { field: "id", op: "==", value: rawVal } });
        } else if (isPlainObject(rawVal)) {
          if (typeof rawVal.equals === "string") {
            candidates.push({
              priority: 0,
              filter: { field: "id", op: "==", value: rawVal.equals },
            });
          } else if (Array.isArray(rawVal.in)) {
            candidates.push({
              priority: 2,
              filter: { field: "id", op: "in", value: rawVal.in },
            });
          }
        }
        continue;
      }

      const isUnique = def.singleUniques?.includes(k);
      const isFk =
        k.endsWith("Id") || k === "date" || k === "username" || k === "admissionNo";

      if (rawVal === null || !isPlainObject(rawVal) || rawVal instanceof Date) {
        candidates.push({
          priority: isUnique ? 1 : isFk ? 2 : 5,
          filter: { field: k, op: "==", value: rawVal },
        });
      } else if (rawVal.equals !== undefined && !isPlainObject(rawVal.equals)) {
        candidates.push({
          priority: isUnique ? 1 : isFk ? 2 : 5,
          filter: { field: k, op: "==", value: rawVal.equals },
        });
      } else if (Array.isArray(rawVal.in)) {
        candidates.push({
          priority: isFk ? 3 : 6,
          filter: { field: k, op: "in", value: rawVal.in },
        });
      }
    }
  };

  inspectObject(where);
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0].filter;
}

function matchesScalarFilter(fieldVal: unknown, filter: unknown): boolean {
  if (filter === undefined) return true;
  if (!isPlainObject(filter)) {
    return valuesEqual(fieldVal, filter);
  }

  const f = filter as Record<string, unknown>;
  const mode = typeof f.mode === "string" ? f.mode : "insensitive";
  const caseInsensitive = mode !== "default";

  if ("equals" in f && f.equals !== undefined) {
    if (!valuesEqual(fieldVal, f.equals)) return false;
  }
  if ("not" in f && f.not !== undefined) {
    if (isPlainObject(f.not)) {
      if (matchesScalarFilter(fieldVal, f.not)) return false;
    } else if (valuesEqual(fieldVal, f.not)) {
      return false;
    }
  }
  if ("in" in f && Array.isArray(f.in)) {
    if (!f.in.some((item) => valuesEqual(fieldVal, item))) return false;
  }
  if ("notIn" in f && Array.isArray(f.notIn)) {
    if (f.notIn.some((item) => valuesEqual(fieldVal, item))) return false;
  }

  const compVal = toComparable(fieldVal);
  if ("lt" in f && f.lt !== undefined) {
    const target = toComparable(f.lt);
    if (compVal === null || target === null || !(compVal < target)) return false;
  }
  if ("lte" in f && f.lte !== undefined) {
    const target = toComparable(f.lte);
    if (compVal === null || target === null || !(compVal <= target)) return false;
  }
  if ("gt" in f && f.gt !== undefined) {
    const target = toComparable(f.gt);
    if (compVal === null || target === null || !(compVal > target)) return false;
  }
  if ("gte" in f && f.gte !== undefined) {
    const target = toComparable(f.gte);
    if (compVal === null || target === null || !(compVal >= target)) return false;
  }

  const strOp = (needle: unknown, kind: "contains" | "startsWith" | "endsWith") => {
    if (typeof fieldVal !== "string" || typeof needle !== "string") return false;
    const hay = caseInsensitive ? fieldVal.toLowerCase() : fieldVal;
    const sub = caseInsensitive ? needle.toLowerCase() : needle;
    if (kind === "contains") return hay.includes(sub);
    if (kind === "startsWith") return hay.startsWith(sub);
    return hay.endsWith(sub);
  };

  if ("contains" in f && f.contains !== undefined && !strOp(f.contains, "contains")) {
    return false;
  }
  if ("startsWith" in f && f.startsWith !== undefined && !strOp(f.startsWith, "startsWith")) {
    return false;
  }
  if ("endsWith" in f && f.endsWith !== undefined && !strOp(f.endsWith, "endsWith")) {
    return false;
  }

  return true;
}

async function matchesWhere(
  model: ModelName,
  record: DbRecord,
  where: WhereObj | undefined,
  session: QuerySession
): Promise<boolean> {
  if (!where) return true;
  const def = MODEL_DEFS[model];

  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;

    if (key === "AND") {
      const clauses = Array.isArray(val) ? val : [val];
      for (const clause of clauses) {
        if (isPlainObject(clause) && !(await matchesWhere(model, record, clause, session))) {
          return false;
        }
      }
      continue;
    }

    if (key === "OR") {
      const clauses = Array.isArray(val) ? val : [];
      let matched = false;
      for (const clause of clauses) {
        if (isPlainObject(clause) && (await matchesWhere(model, record, clause, session))) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
      continue;
    }

    if (key === "NOT") {
      const clauses = Array.isArray(val) ? val : [val];
      for (const clause of clauses) {
        if (isPlainObject(clause) && (await matchesWhere(model, record, clause, session))) {
          return false;
        }
      }
      continue;
    }

    if (def.compoundUniques?.[key] && isPlainObject(val)) {
      for (const field of def.compoundUniques[key]) {
        if (!valuesEqual(record[field], val[field])) return false;
      }
      continue;
    }

    const rel = def.relations[key];
    if (rel) {
      if (rel.kind === "belongsTo" || rel.kind === "hasOne") {
        let target: DbRecord | null = null;
        if (rel.kind === "belongsTo") {
          const fkVal = record[rel.fk];
          if (typeof fkVal === "string" && fkVal) {
            target = await fetchDocById(rel.targetModel, fkVal, session);
          }
        } else {
          const children = await getRelatedChildren(rel, record.id, session);
          target = children[0] ?? null;
        }

        if (val === null) {
          if (target !== null) return false;
        } else if (isPlainObject(val)) {
          if ("is" in val) {
            const sub = val.is;
            if (sub === null) {
              if (target !== null) return false;
            } else if (isPlainObject(sub)) {
              if (!target || !(await matchesWhere(rel.targetModel, target, sub, session))) {
                return false;
              }
            }
          } else if ("isNot" in val) {
            const sub = val.isNot;
            if (sub === null) {
              if (target === null) return false;
            } else if (isPlainObject(sub)) {
              if (target && (await matchesWhere(rel.targetModel, target, sub, session))) {
                return false;
              }
            }
          } else {
            if (!target || !(await matchesWhere(rel.targetModel, target, val, session))) {
              return false;
            }
          }
        }
        continue;
      }

      const children = await getRelatedChildren(rel, record.id, session);
      if (isPlainObject(val)) {
        if (isPlainObject(val.some)) {
          let anyMatch = false;
          for (const child of children) {
            if (await matchesWhere(rel.targetModel, child, val.some, session)) {
              anyMatch = true;
              break;
            }
          }
          if (!anyMatch) return false;
        }
        if (isPlainObject(val.every)) {
          for (const child of children) {
            if (!(await matchesWhere(rel.targetModel, child, val.every, session))) {
              return false;
            }
          }
        }
        if (isPlainObject(val.none)) {
          for (const child of children) {
            if (await matchesWhere(rel.targetModel, child, val.none, session)) {
              return false;
            }
          }
        }
      }
      continue;
    }

    if (!matchesScalarFilter(record[key], val)) {
      return false;
    }
  }

  return true;
}

async function prefetchWhereRelations(
  model: ModelName,
  records: DbRecord[],
  where: WhereObj | undefined,
  session: QuerySession
): Promise<void> {
  if (!where || records.length === 0) return;
  const def = MODEL_DEFS[model];

  const inspect = async (obj: WhereObj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (!v) continue;
      if ((k === "AND" || k === "OR" || k === "NOT")) {
        const arr = Array.isArray(v) ? v : [v];
        for (const item of arr) {
          if (isPlainObject(item)) await inspect(item);
        }
        continue;
      }
      const rel = def.relations[k];
      if (!rel) continue;
      if (rel.kind === "belongsTo") {
        const fkIds = records
          .map((r) => r[rel.fk])
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        await fetchDocsByIds(rel.targetModel, fkIds, session);
      } else {
        await fetchDocsByForeignKey(
          rel.targetModel,
          rel.fk,
          records.map((r) => r.id),
          session
        );
      }
    }
  };

  await inspect(where);
}

interface OrderClause {
  path: string[];
  dir: "asc" | "desc";
}

function parseOrderBy(orderBy?: OrderByInput): OrderClause[] {
  if (!orderBy) return [];
  const items = Array.isArray(orderBy) ? orderBy : [orderBy];
  const clauses: OrderClause[] = [];

  const extract = (obj: Record<string, unknown>, prefix: string[]) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v === "asc" || v === "desc") {
        clauses.push({ path: [...prefix, k], dir: v });
      } else if (isPlainObject(v)) {
        extract(v, [...prefix, k]);
      }
    }
  };

  for (const item of items) {
    if (isPlainObject(item)) extract(item, []);
  }
  return clauses;
}

async function resolvePathValue(
  model: ModelName,
  record: DbRecord,
  path: string[],
  session: QuerySession
): Promise<unknown> {
  let currModel = model;
  let curr: DbRecord | null = record;

  for (let i = 0; i < path.length; i++) {
    if (!curr) return null;
    const seg = path[i];
    if (i === path.length - 1) {
      return curr[seg];
    }
    const rel = MODEL_DEFS[currModel].relations[seg];
    if (!rel) return null;
    if (rel.kind === "belongsTo") {
      const fk: unknown = curr[rel.fk];
      curr = typeof fk === "string" ? await fetchDocById(rel.targetModel, fk, session) : null;
    } else if (rel.kind === "hasOne") {
      const children = await getRelatedChildren(rel, curr.id, session);
      curr = children[0] ?? null;
    } else {
      curr = null;
    }
    currModel = rel.targetModel;
  }
  return null;
}

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  const ca = toComparable(a);
  const cb = toComparable(b);
  if (ca === cb) return 0;
  if (ca === null) return 1;
  if (cb === null) return -1;

  let cmp = 0;
  if (typeof ca === "number" && typeof cb === "number") {
    cmp = ca - cb;
  } else if (typeof ca === "string" && typeof cb === "string") {
    cmp = ca < cb ? -1 : ca > cb ? 1 : 0;
  } else if (typeof ca === "boolean" && typeof cb === "boolean") {
    cmp = ca === cb ? 0 : ca ? 1 : -1;
  } else {
    const sa = String(ca);
    const sb = String(cb);
    cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  return dir === "desc" ? -cmp : cmp;
}

async function sortRecords(
  model: ModelName,
  records: DbRecord[],
  orderBy: OrderByInput | undefined,
  session: QuerySession
): Promise<DbRecord[]> {
  const clauses = parseOrderBy(orderBy);
  if (clauses.length === 0 || records.length <= 1) return records;

  // Prefetch nested relation chains used inside orderBy
  for (const clause of clauses) {
    if (clause.path.length > 1) {
      let currModel = model;
      let currDocs = records;
      for (let i = 0; i < clause.path.length - 1; i++) {
        const rel = MODEL_DEFS[currModel].relations[clause.path[i]];
        if (!rel || currDocs.length === 0) break;
        if (rel.kind === "belongsTo") {
          const fkIds = currDocs
            .map((r) => r[rel.fk])
            .filter((id): id is string => typeof id === "string");
          await fetchDocsByIds(rel.targetModel, fkIds, session);
          const nextDocs: DbRecord[] = [];
          for (const id of fkIds) {
            const target = await fetchDocById(rel.targetModel, id, session);
            if (target) nextDocs.push(target);
          }
          currDocs = nextDocs;
        }
        currModel = rel.targetModel;
      }
    }
  }

  const keyed = await Promise.all(
    records.map(async (rec) => ({
      rec,
      keys: await Promise.all(
        clauses.map((c) => resolvePathValue(model, rec, c.path, session))
      ),
    }))
  );

  keyed.sort((a, b) => {
    for (let i = 0; i < clauses.length; i++) {
      const cmp = compareValues(a.keys[i], b.keys[i], clauses[i].dir);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });

  return keyed.map((k) => k.rec);
}

async function prefetchIncludeTree(
  model: ModelName,
  records: DbRecord[],
  opts: { include?: SelectOrInclude; select?: SelectOrInclude },
  session: QuerySession
): Promise<void> {
  if (records.length === 0) return;
  const def = MODEL_DEFS[model];
  const entries = [
    ...Object.entries(opts.include ?? {}),
    ...Object.entries(opts.select ?? {}),
  ];

  for (const [key, val] of entries) {
    if (!val) continue;
    if (key === "_count") {
      const countSpec = isPlainObject(val) && isPlainObject(val.select) ? val.select : {};
      for (const relName of Object.keys(countSpec)) {
        const rel = def.relations[relName];
        if (rel && rel.kind !== "belongsTo") {
          await fetchDocsByForeignKey(
            rel.targetModel,
            rel.fk,
            records.map((r) => r.id),
            session
          );
        }
      }
      continue;
    }

    const rel = def.relations[key];
    if (!rel) continue;

    let childRecords: DbRecord[] = [];
    if (rel.kind === "belongsTo") {
      const ids = records
        .map((r) => r[rel.fk])
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      await fetchDocsByIds(rel.targetModel, ids, session);
      for (const id of new Set(ids)) {
        const doc = await fetchDocById(rel.targetModel, id, session);
        if (doc) childRecords.push(doc);
      }
    } else {
      await fetchDocsByForeignKey(
        rel.targetModel,
        rel.fk,
        records.map((r) => r.id),
        session
      );
      for (const rec of records) {
        const children = await getRelatedChildren(rel, rec.id, session);
        childRecords.push(...children);
      }
    }

    if (isPlainObject(val) && (val.include || val.select)) {
      await prefetchIncludeTree(
        rel.targetModel,
        childRecords,
        {
          include: isPlainObject(val.include) ? val.include : undefined,
          select: isPlainObject(val.select) ? val.select : undefined,
        },
        session
      );
    }
  }
}

async function projectRecord(
  model: ModelName,
  record: DbRecord,
  opts: { include?: SelectOrInclude; select?: SelectOrInclude },
  session: QuerySession
): Promise<Record<string, unknown>> {
  const def = MODEL_DEFS[model];
  const base: Record<string, unknown> = {};

  if (opts.select) {
    for (const [k, spec] of Object.entries(opts.select)) {
      if (!spec) continue;
      if (k === "_count") {
        base._count = await resolveCountField(model, record, spec, session);
        continue;
      }
      const rel = def.relations[k];
      if (rel) {
        base[k] = await resolveRelationField(model, record, rel, spec, session);
      } else {
        base[k] = cloneValue(record[k]);
      }
    }
    return base;
  }

  for (const [k, v] of Object.entries(record)) {
    base[k] = cloneValue(v);
  }
  if (opts.include) {
    for (const [k, spec] of Object.entries(opts.include)) {
      if (!spec) continue;
      if (k === "_count") {
        base._count = await resolveCountField(model, record, spec, session);
        continue;
      }
      const rel = def.relations[k];
      if (rel) {
        base[k] = await resolveRelationField(model, record, rel, spec, session);
      }
    }
  }
  return base;
}

async function resolveCountField(
  model: ModelName,
  record: DbRecord,
  spec: unknown,
  session: QuerySession
): Promise<Record<string, number>> {
  const def = MODEL_DEFS[model];
  const counts: Record<string, number> = {};
  const sel = isPlainObject(spec) && isPlainObject(spec.select) ? spec.select : {};

  for (const [relName, relFilter] of Object.entries(sel)) {
    if (!relFilter) continue;
    const rel = def.relations[relName];
    if (!rel) continue;
    const children = await getRelatedChildren(rel, record.id, session);
    if (isPlainObject(relFilter) && isPlainObject(relFilter.where)) {
      let n = 0;
      for (const child of children) {
        if (await matchesWhere(rel.targetModel, child, relFilter.where, session)) {
          n++;
        }
      }
      counts[relName] = n;
    } else {
      counts[relName] = children.length;
    }
  }
  return counts;
}

async function resolveRelationField(
  _model: ModelName,
  record: DbRecord,
  rel: RelationDef,
  spec: unknown,
  session: QuerySession
): Promise<unknown> {
  const childOpts = isPlainObject(spec) ? spec : {};

  if (rel.kind === "belongsTo") {
    const fkVal = record[rel.fk];
    if (typeof fkVal !== "string" || !fkVal) return null;
    const target = await fetchDocById(rel.targetModel, fkVal, session);
    if (!target) return null;
    return projectRecord(
      rel.targetModel,
      target,
      {
        include: isPlainObject(childOpts.include) ? childOpts.include : undefined,
        select: isPlainObject(childOpts.select) ? childOpts.select : undefined,
      },
      session
    );
  }

  let children = await getRelatedChildren(rel, record.id, session);
  if (isPlainObject(childOpts.where)) {
    const filtered: DbRecord[] = [];
    for (const c of children) {
      if (await matchesWhere(rel.targetModel, c, childOpts.where, session)) {
        filtered.push(c);
      }
    }
    children = filtered;
  }

  if (rel.kind === "hasOne") {
    const first = children[0] ?? null;
    if (!first) return null;
    return projectRecord(
      rel.targetModel,
      first,
      {
        include: isPlainObject(childOpts.include) ? childOpts.include : undefined,
        select: isPlainObject(childOpts.select) ? childOpts.select : undefined,
      },
      session
    );
  }

  if (childOpts.orderBy) {
    children = await sortRecords(
      rel.targetModel,
      children,
      childOpts.orderBy as OrderByInput,
      session
    );
  }
  const skip = typeof childOpts.skip === "number" ? childOpts.skip : 0;
  const take = typeof childOpts.take === "number" ? childOpts.take : undefined;
  if (skip > 0 || take !== undefined) {
    children = children.slice(skip, take !== undefined ? skip + take : undefined);
  }

  return Promise.all(
    children.map((c) =>
      projectRecord(
        rel.targetModel,
        c,
        {
          include: isPlainObject(childOpts.include) ? childOpts.include : undefined,
          select: isPlainObject(childOpts.select) ? childOpts.select : undefined,
        },
        session
      )
    )
  );
}

async function resolveUniqueWhere(
  model: ModelName,
  where: WhereObj,
  session: QuerySession
): Promise<DbRecord | null> {
  if (typeof where.id === "string" && Object.keys(where).length === 1) {
    return fetchDocById(model, where.id, session);
  }

  const pushdown = selectPushdownFilter(model, where);
  const candidates = await fetchModelDocs(model, session, pushdown);
  for (const doc of candidates) {
    if (await matchesWhere(model, doc, where, session)) {
      return doc;
    }
  }
  return null;
}

async function checkUniques(
  model: ModelName,
  candidate: DbRecord,
  excludeId: string | undefined,
  session: QuerySession
): Promise<void> {
  const def = MODEL_DEFS[model];

  if (def.singleUniques) {
    for (const field of def.singleUniques) {
      const val = candidate[field];
      if (val === null || val === undefined) continue;
      const matches = await fetchModelDocs(model, session, {
        field,
        op: "==",
        value: val,
      });
      if (matches.some((m) => m.id !== excludeId && valuesEqual(m[field], val))) {
        throw new Error(`Unique constraint failed on ${model}.${field}`);
      }
    }
  }

  if (def.compoundUniques) {
    for (const [constraintName, fields] of Object.entries(def.compoundUniques)) {
      const firstField = fields[0];
      const matches = firstField
        ? await fetchModelDocs(model, session, {
            field: firstField,
            op: "==",
            value: candidate[firstField],
          })
        : await fetchModelDocs(model, session);

      const duplicate = matches.find(
        (m) =>
          m.id !== excludeId &&
          fields.every((f) => valuesEqual(m[f], candidate[f]))
      );
      if (duplicate) {
        throw new Error(`Unique constraint failed on ${model}.${constraintName}`);
      }
    }
  }
}

async function queueWrite(
  model: ModelName,
  doc: DbRecord,
  session: QuerySession
): Promise<void> {
  if (session.tx) {
    let modelMap = session.tx.writes.get(model);
    if (!modelMap) {
      modelMap = new Map();
      session.tx.writes.set(model, modelMap);
    }
    session.tx.deletes.get(model)?.delete(doc.id);
    modelMap.set(doc.id, cloneValue(doc));
    invalidateSessionModel(session, model);
    return;
  }
  await commitFirestoreBatch([
    { type: "set", col: MODEL_DEFS[model].collection, id: doc.id, data: doc },
  ]);
  invalidateSessionModel(session, model);
}

async function queueDeletes(
  deletions: { model: ModelName; id: string }[],
  session: QuerySession
): Promise<void> {
  if (deletions.length === 0) return;

  if (session.tx) {
    for (const d of deletions) {
      let delSet = session.tx.deletes.get(d.model);
      if (!delSet) {
        delSet = new Set();
        session.tx.deletes.set(d.model, delSet);
      }
      delSet.add(d.id);
      session.tx.writes.get(d.model)?.delete(d.id);
      invalidateSessionModel(session, d.model);
    }
    return;
  }

  const ops: BatchOperation[] = deletions.map((d) => ({
    type: "delete",
    col: MODEL_DEFS[d.model].collection,
    id: d.id,
  }));
  await commitFirestoreBatch(ops);
  for (const model of new Set(deletions.map((d) => d.model))) {
    invalidateSessionModel(session, model);
  }
}

async function collectCascadeDeletes(
  model: ModelName,
  id: string,
  session: QuerySession,
  visited = new Set<string>()
): Promise<{ model: ModelName; id: string }[]> {
  const key = `${model}:${id}`;
  if (visited.has(key)) return [];
  visited.add(key);

  const out: { model: ModelName; id: string }[] = [{ model, id }];
  const def = MODEL_DEFS[model];

  for (const rel of Object.values(def.relations)) {
    if (!rel.cascadeDelete) continue;
    const children = await fetchModelDocs(rel.targetModel, session, {
      field: rel.fk,
      op: "==",
      value: id,
    });
    for (const child of children) {
      if (valuesEqual(child[rel.fk], id)) {
        const nested = await collectCascadeDeletes(
          rel.targetModel,
          child.id,
          session,
          visited
        );
        out.push(...nested);
      }
    }
  }
  return out;
}

function buildCreatedRecord(model: ModelName, rawData: Record<string, unknown>): {
  record: DbRecord;
  nestedCreates: { rel: RelationDef; items: Record<string, unknown>[] }[];
} {
  const def = MODEL_DEFS[model];
  const now = new Date();
  const record: Record<string, unknown> = {
    ...(def.defaults ? cloneValue(def.defaults) : {}),
  };

  if (def.nowDefaults) {
    for (const field of def.nowDefaults) {
      record[field] = new Date(now.getTime());
    }
  }
  if (def.hasCreatedAt) record.createdAt = new Date(now.getTime());
  if (def.hasUpdatedAt) record.updatedAt = new Date(now.getTime());

  const nestedCreates: { rel: RelationDef; items: Record<string, unknown>[] }[] = [];

  for (const [k, v] of Object.entries(rawData)) {
    if (v === undefined) continue;
    const rel = def.relations[k];
    if (rel) {
      if (isPlainObject(v) && isPlainObject(v.connect) && typeof v.connect.id === "string") {
        if (rel.kind === "belongsTo") {
          record[rel.fk] = v.connect.id;
        }
      } else if (isPlainObject(v) && v.create !== undefined) {
        const items = Array.isArray(v.create) ? v.create : [v.create];
        nestedCreates.push({
          rel,
          items: items.filter(isPlainObject),
        });
      }
      continue;
    }
    record[k] = cloneValue(v);
  }

  const id =
    typeof record.id === "string" && record.id
      ? record.id
      : def.fixedId ?? generateId();
  record.id = id;

  return { record: record as DbRecord, nestedCreates };
}

function applyUpdateData(
  model: ModelName,
  existing: DbRecord,
  rawData: Record<string, unknown>
): DbRecord {
  const def = MODEL_DEFS[model];
  const next: DbRecord = cloneValue(existing);

  for (const [k, v] of Object.entries(rawData)) {
    if (v === undefined) continue;
    const rel = def.relations[k];
    if (rel) {
      if (
        rel.kind === "belongsTo" &&
        isPlainObject(v) &&
        isPlainObject(v.connect) &&
        typeof v.connect.id === "string"
      ) {
        next[rel.fk] = v.connect.id;
      }
      continue;
    }

    if (isPlainObject(v)) {
      if (typeof v.increment === "number") {
        next[k] = Number(next[k] ?? 0) + v.increment;
        continue;
      }
      if (typeof v.decrement === "number") {
        next[k] = Number(next[k] ?? 0) - v.decrement;
        continue;
      }
      if ("set" in v) {
        next[k] = cloneValue(v.set);
        continue;
      }
    }

    next[k] = cloneValue(v);
  }

  if (def.hasUpdatedAt) {
    next.updatedAt = new Date();
  }
  return next;
}

function createQuery<T>(fn: (tx?: TxOverlay) => Promise<T>): Promise<T> {
  let promise: Promise<T> | null = null;
  const run = (tx?: TxOverlay) => {
    if (tx) return fn(tx);
    if (!promise) promise = fn(undefined);
    return promise;
  };

  const thenable: Record<string | symbol, unknown> = {
    [RUN_WITH_TX]: (tx?: TxOverlay) => fn(tx),
    then: <R1 = T, R2 = never>(
      onFulfilled?: ((v: T) => R1 | PromiseLike<R1>) | null,
      onRejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null
    ) => run().then(onFulfilled, onRejected),
    catch: <R = never>(onRejected?: ((r: unknown) => R | PromiseLike<R>) | null) =>
      run().catch(onRejected),
    finally: (onFinally?: (() => void) | null) => run().finally(onFinally),
  };

  return thenable as unknown as Promise<T>;
}

function isLazyQuery(val: unknown): val is { [RUN_WITH_TX]: (tx?: TxOverlay) => Promise<unknown> } {
  return (
    val !== null &&
    (typeof val === "object" || typeof val === "function") &&
    RUN_WITH_TX in val
  );
}

function buildModelDelegate(model: ModelName, boundTx?: TxOverlay) {
  const execFindMany = async (
    args: Record<string, unknown> | undefined,
    tx?: TxOverlay
  ): Promise<Record<string, unknown>[]> => {
    const session = createSession(tx);
    const where = isPlainObject(args?.where) ? args.where : undefined;
    const pushdown = selectPushdownFilter(model, where);
    const rawDocs = await fetchModelDocs(model, session, pushdown);
    await prefetchWhereRelations(model, rawDocs, where, session);

    const matched: DbRecord[] = [];
    for (const doc of rawDocs) {
      if (await matchesWhere(model, doc, where, session)) {
        matched.push(doc);
      }
    }

    const sorted = await sortRecords(
      model,
      matched,
      args?.orderBy as OrderByInput | undefined,
      session
    );

    const skip = typeof args?.skip === "number" ? args.skip : 0;
    const take = typeof args?.take === "number" ? args.take : undefined;
    const paged =
      skip > 0 || take !== undefined
        ? sorted.slice(skip, take !== undefined ? skip + take : undefined)
        : sorted;

    const projOpts = {
      include: isPlainObject(args?.include) ? args.include : undefined,
      select: isPlainObject(args?.select) ? args.select : undefined,
    };
    await prefetchIncludeTree(model, paged, projOpts, session);
    return Promise.all(paged.map((r) => projectRecord(model, r, projOpts, session)));
  };

  const execFindUnique = async (
    args: Record<string, unknown>,
    tx?: TxOverlay
  ): Promise<Record<string, unknown> | null> => {
    const session = createSession(tx);
    const where = isPlainObject(args?.where) ? args.where : {};
    const found = await resolveUniqueWhere(model, where, session);
    if (!found) return null;

    const projOpts = {
      include: isPlainObject(args?.include) ? args.include : undefined,
      select: isPlainObject(args?.select) ? args.select : undefined,
    };
    await prefetchIncludeTree(model, [found], projOpts, session);
    return projectRecord(model, found, projOpts, session);
  };

  const execCreate = async (
    args: Record<string, unknown>,
    tx?: TxOverlay
  ): Promise<Record<string, unknown>> => {
    const session = createSession(tx);
    const data = isPlainObject(args?.data) ? args.data : {};
    const { record, nestedCreates } = buildCreatedRecord(model, data);
    await checkUniques(model, record, undefined, session);
    await queueWrite(model, record, session);

    for (const nc of nestedCreates) {
      for (const item of nc.items) {
        const childInput = { ...item, [nc.rel.fk]: record.id };
        const builtChild = buildCreatedRecord(nc.rel.targetModel, childInput);
        await checkUniques(nc.rel.targetModel, builtChild.record, undefined, session);
        await queueWrite(nc.rel.targetModel, builtChild.record, session);
      }
    }

    const projOpts = {
      include: isPlainObject(args?.include) ? args.include : undefined,
      select: isPlainObject(args?.select) ? args.select : undefined,
    };
    await prefetchIncludeTree(model, [record], projOpts, session);
    return projectRecord(model, record, projOpts, session);
  };

  const execUpdate = async (
    args: Record<string, unknown>,
    tx?: TxOverlay
  ): Promise<Record<string, unknown>> => {
    const session = createSession(tx);
    const where = isPlainObject(args?.where) ? args.where : {};
    const existing = await resolveUniqueWhere(model, where, session);
    if (!existing) {
      throw new Error(`Record to update not found in ${model}`);
    }
    const data = isPlainObject(args?.data) ? args.data : {};
    const updated = applyUpdateData(model, existing, data);
    await checkUniques(model, updated, existing.id, session);
    await queueWrite(model, updated, session);

    const projOpts = {
      include: isPlainObject(args?.include) ? args.include : undefined,
      select: isPlainObject(args?.select) ? args.select : undefined,
    };
    await prefetchIncludeTree(model, [updated], projOpts, session);
    return projectRecord(model, updated, projOpts, session);
  };

  return {
    findUnique: (args: Record<string, unknown>) =>
      createQuery((tx) => execFindUnique(args, tx ?? boundTx)),

    findUniqueOrThrow: (args: Record<string, unknown>) =>
      createQuery(async (tx) => {
        const res = await execFindUnique(args, tx ?? boundTx);
        if (!res) throw new Error(`No ${model} found`);
        return res;
      }),

    findFirst: (args?: Record<string, unknown>) =>
      createQuery(async (tx) => {
        const rows = await execFindMany({ ...(args ?? {}), take: 1 }, tx ?? boundTx);
        return rows[0] ?? null;
      }),

    findMany: (args?: Record<string, unknown>) =>
      createQuery((tx) => execFindMany(args, tx ?? boundTx)),

    count: (args?: Record<string, unknown>) =>
      createQuery(async (tx) => {
        const session = createSession(tx ?? boundTx);
        const where = isPlainObject(args?.where) ? args.where : undefined;
        const pushdown = selectPushdownFilter(model, where);
        const rawDocs = await fetchModelDocs(model, session, pushdown);
        await prefetchWhereRelations(model, rawDocs, where, session);
        let count = 0;
        for (const doc of rawDocs) {
          if (await matchesWhere(model, doc, where, session)) count++;
        }
        return count;
      }),

    aggregate: (args: Record<string, unknown>) =>
      createQuery(async (tx) => {
        const session = createSession(tx ?? boundTx);
        const where = isPlainObject(args?.where) ? args.where : undefined;
        const pushdown = selectPushdownFilter(model, where);
        const rawDocs = await fetchModelDocs(model, session, pushdown);
        await prefetchWhereRelations(model, rawDocs, where, session);
        const matched: DbRecord[] = [];
        for (const doc of rawDocs) {
          if (await matchesWhere(model, doc, where, session)) matched.push(doc);
        }

        const result: Record<string, unknown> = {};
        if (args?._count) {
          if (args._count === true) {
            result._count = matched.length;
          } else if (isPlainObject(args._count)) {
            const countObj: Record<string, number> = {};
            for (const [k, v] of Object.entries(args._count)) {
              if (!v) continue;
              countObj[k] =
                k === "_all"
                  ? matched.length
                  : matched.filter((r) => r[k] !== null && r[k] !== undefined).length;
            }
            result._count = countObj;
          }
        }

        const computeNumericAgg = (
          spec: unknown,
          mode: "sum" | "avg" | "min" | "max"
        ): Record<string, number | null> => {
          const out: Record<string, number | null> = {};
          if (!isPlainObject(spec)) return out;
          for (const [field, enabled] of Object.entries(spec)) {
            if (!enabled) continue;
            const nums = matched
              .map((r) => r[field])
              .filter((v): v is number => typeof v === "number");
            if (nums.length === 0) {
              out[field] = null;
            } else if (mode === "sum") {
              out[field] = nums.reduce((acc, n) => acc + n, 0);
            } else if (mode === "avg") {
              out[field] = nums.reduce((acc, n) => acc + n, 0) / nums.length;
            } else if (mode === "min") {
              out[field] = Math.min(...nums);
            } else {
              out[field] = Math.max(...nums);
            }
          }
          return out;
        };

        if (args?._sum) result._sum = computeNumericAgg(args._sum, "sum");
        if (args?._avg) result._avg = computeNumericAgg(args._avg, "avg");
        if (args?._min) result._min = computeNumericAgg(args._min, "min");
        if (args?._max) result._max = computeNumericAgg(args._max, "max");
        return result;
      }),

    groupBy: (args: Record<string, unknown>) =>
      createQuery(async (tx) => {
        const session = createSession(tx ?? boundTx);
        const byFields = Array.isArray(args.by)
          ? (args.by as string[])
          : [String(args.by)];
        const where = isPlainObject(args?.where) ? args.where : undefined;
        const pushdown = selectPushdownFilter(model, where);
        const rawDocs = await fetchModelDocs(model, session, pushdown);
        await prefetchWhereRelations(model, rawDocs, where, session);

        const groups = new Map<string, { keyVals: Record<string, unknown>; rows: DbRecord[] }>();
        for (const doc of rawDocs) {
          if (!(await matchesWhere(model, doc, where, session))) continue;
          const keyVals: Record<string, unknown> = {};
          for (const f of byFields) {
            keyVals[f] = doc[f] ?? null;
          }
          const groupKey = JSON.stringify(byFields.map((f) => keyVals[f]));
          let entry = groups.get(groupKey);
          if (!entry) {
            entry = { keyVals, rows: [] };
            groups.set(groupKey, entry);
          }
          entry.rows.push(doc);
        }

        const rows = Array.from(groups.values()).map(({ keyVals, rows: groupRows }) => {
          const item: Record<string, unknown> = { ...keyVals };
          if (args?._count) {
            if (args._count === true) {
              item._count = groupRows.length;
            } else if (isPlainObject(args._count)) {
              const countObj: Record<string, number> = {};
              for (const [k, v] of Object.entries(args._count)) {
                if (!v) continue;
                countObj[k] =
                  k === "_all"
                    ? groupRows.length
                    : groupRows.filter((r) => r[k] !== null && r[k] !== undefined).length;
              }
              item._count = countObj;
            }
          }
          if (isPlainObject(args?._sum)) {
            const sumObj: Record<string, number | null> = {};
            for (const [field, enabled] of Object.entries(args._sum)) {
              if (!enabled) continue;
              const nums = groupRows
                .map((r) => r[field])
                .filter((v): v is number => typeof v === "number");
              sumObj[field] = nums.length
                ? nums.reduce((acc, n) => acc + n, 0)
                : null;
            }
            item._sum = sumObj;
          }
          return item;
        });

        return rows;
      }),

    create: (args: Record<string, unknown>) =>
      createQuery((tx) => execCreate(args, tx ?? boundTx)),

    createMany: (args: Record<string, unknown>) =>
      createQuery(async (tx) => {
        const effectiveTx = tx ?? boundTx;
        const items = Array.isArray(args?.data)
          ? args.data
          : isPlainObject(args?.data)
            ? [args.data]
            : [];
        const skipDuplicates = Boolean(args?.skipDuplicates);

        // Wrap non-transactional createMany in a single batch commit when possible
        if (!effectiveTx) {
          const batchTx = createTxOverlay();
          const session = createSession(batchTx);
          let count = 0;
          for (const raw of items) {
            if (!isPlainObject(raw)) continue;
            const { record } = buildCreatedRecord(model, raw);
            try {
              await checkUniques(model, record, undefined, session);
              await queueWrite(model, record, session);
              count++;
            } catch (err) {
              if (!skipDuplicates) throw err;
            }
          }
          await batchTx.commit();
          return { count };
        }

        const session = createSession(effectiveTx);
        let count = 0;
        for (const raw of items) {
          if (!isPlainObject(raw)) continue;
          const { record } = buildCreatedRecord(model, raw);
          try {
            await checkUniques(model, record, undefined, session);
            await queueWrite(model, record, session);
            count++;
          } catch (err) {
            if (!skipDuplicates) throw err;
          }
        }
        return { count };
      }),

    update: (args: Record<string, unknown>) =>
      createQuery((tx) => execUpdate(args, tx ?? boundTx)),

    updateMany: (args: Record<string, unknown>) =>
      createQuery(async (tx) => {
        const effectiveTx = tx ?? boundTx;
        const where = isPlainObject(args?.where) ? args.where : undefined;
        const data = isPlainObject(args?.data) ? args.data : {};

        const applyUpdates = async (session: QuerySession) => {
          const pushdown = selectPushdownFilter(model, where);
          const rawDocs = await fetchModelDocs(model, session, pushdown);
          await prefetchWhereRelations(model, rawDocs, where, session);
          let count = 0;
          for (const doc of rawDocs) {
            if (!(await matchesWhere(model, doc, where, session))) continue;
            const next = applyUpdateData(model, doc, data);
            await queueWrite(model, next, session);
            count++;
          }
          return count;
        };

        if (!effectiveTx) {
          const batchTx = createTxOverlay();
          const count = await applyUpdates(createSession(batchTx));
          await batchTx.commit();
          return { count };
        }
        const count = await applyUpdates(createSession(effectiveTx));
        return { count };
      }),

    upsert: (args: Record<string, unknown>) =>
      createQuery(async (tx) => {
        const effectiveTx = tx ?? boundTx;
        const session = createSession(effectiveTx);
        const where = isPlainObject(args?.where) ? args.where : {};
        const existing = await resolveUniqueWhere(model, where, session);

        if (existing) {
          return execUpdate(
            {
              where: { id: existing.id },
              data: args.update,
              include: args.include,
              select: args.select,
            },
            effectiveTx
          );
        }

        const createData = isPlainObject(args?.create) ? { ...args.create } : {};
        for (const [wk, wv] of Object.entries(where)) {
          if (MODEL_DEFS[model].compoundUniques?.[wk] && isPlainObject(wv)) {
            for (const [ck, cv] of Object.entries(wv)) {
              if (createData[ck] === undefined) createData[ck] = cv;
            }
          } else if (
            (typeof wv === "string" || typeof wv === "number") &&
            createData[wk] === undefined
          ) {
            createData[wk] = wv;
          }
        }
        return execCreate(
          {
            data: createData,
            include: args.include,
            select: args.select,
          },
          effectiveTx
        );
      }),

    delete: (args: Record<string, unknown>) =>
      createQuery(async (tx) => {
        const effectiveTx = tx ?? boundTx;
        const where = isPlainObject(args?.where) ? args.where : {};
        const session = createSession(effectiveTx);
        const existing = await resolveUniqueWhere(model, where, session);
        if (!existing) {
          throw new Error(`Record to delete not found in ${model}`);
        }

        const projOpts = {
          include: isPlainObject(args?.include) ? args.include : undefined,
          select: isPlainObject(args?.select) ? args.select : undefined,
        };
        await prefetchIncludeTree(model, [existing], projOpts, session);
        const projected = await projectRecord(model, existing, projOpts, session);

        const deletions = await collectCascadeDeletes(model, existing.id, session);
        await queueDeletes(deletions, session);
        return projected;
      }),

    deleteMany: (args?: Record<string, unknown>) =>
      createQuery(async (tx) => {
        const effectiveTx = tx ?? boundTx;
        const where = isPlainObject(args?.where) ? args.where : undefined;

        const runDeleteMany = async (session: QuerySession) => {
          const pushdown = selectPushdownFilter(model, where);
          const rawDocs = await fetchModelDocs(model, session, pushdown);
          await prefetchWhereRelations(model, rawDocs, where, session);

          const targets: DbRecord[] = [];
          for (const doc of rawDocs) {
            if (await matchesWhere(model, doc, where, session)) {
              targets.push(doc);
            }
          }

          const allDeletions: { model: ModelName; id: string }[] = [];
          const visited = new Set<string>();
          for (const t of targets) {
            const items = await collectCascadeDeletes(model, t.id, session, visited);
            allDeletions.push(...items);
          }
          await queueDeletes(allDeletions, session);
          return targets.length;
        };

        if (!effectiveTx) {
          const batchTx = createTxOverlay();
          const count = await runDeleteMany(createSession(batchTx));
          await batchTx.commit();
          return { count };
        }
        const count = await runDeleteMany(createSession(effectiveTx));
        return { count };
      }),
  };
}

const globalForTxLock = globalThis as unknown as {
  __firestoreTxQueue?: Promise<unknown>;
};

async function withTransactionLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalForTxLock.__firestoreTxQueue ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalForTxLock.__firestoreTxQueue = prev.then(() => current, () => current);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
  }
}

function buildClient(boundTx?: TxOverlay) {
  const client: Record<string, unknown> = {};
  for (const model of ALL_MODELS) {
    client[model] = buildModelDelegate(model, boundTx);
  }

  client.$transaction = async <T>(
    arg: ((tx: unknown) => Promise<T>) | Promise<unknown>[]
  ): Promise<T | unknown[]> => {
    return withTransactionLock(async () => {
      const tx = createTxOverlay();
      if (typeof arg === "function") {
        const txClient = buildClient(tx);
        const res = await arg(txClient);
        await tx.commit();
        return res;
      }

      const results: unknown[] = [];
      for (const op of arg) {
        if (isLazyQuery(op)) {
          results.push(await op[RUN_WITH_TX](tx));
        } else {
          results.push(await op);
        }
      }
      await tx.commit();
      return results;
    });
  };

  client.$connect = async () => {};
  client.$disconnect = async () => {};

  return client;
}

export const firestorePrisma = buildClient() as unknown as PrismaClient;
