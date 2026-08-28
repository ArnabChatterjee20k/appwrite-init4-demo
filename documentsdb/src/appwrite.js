// Appwrite DocumentsDB client — the persistent store for the Log Explorer.
// Client-side only. An unauthenticated browser request is the `guests` role
// automatically; with the collection granting the `any` role create/read/delete,
// no login or session is needed.

import { Client, DocumentsDB, ID, Query } from "appwrite";
import { ENV } from "./env.generated.js";

const endpoint = ENV.APPWRITE_ENDPOINT;
const projectId = ENV.APPWRITE_PROJECT_ID;
const databaseId = ENV.APPWRITE_DATABASE_ID;
const collectionId = ENV.APPWRITE_TABLE_ID;

export const ready = Boolean(endpoint && projectId && databaseId && collectionId);

let db = null;
if (ready) {
  const client = new Client().setEndpoint(endpoint).setProject(projectId);
  db = new DocumentsDB(client);
}

// Strip our internal + Appwrite system fields before writing.
function toData(doc) {
  const out = {};
  for (const k in doc) {
    if (k === "_id" || k === "_new" || k[0] === "$") continue;
    out[k] = doc[k];
  }
  return out;
}

// Map an Appwrite document back to the shape the UI uses.
function fromRow(row) {
  const out = {};
  for (const k in row) if (k[0] !== "$") out[k] = row[k];
  out._id = row.$id;
  if (!out.ts) out.ts = row.$createdAt;
  return out;
}

// Call our own Bun API (server.js) for privileged operations.
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Persist documents.
//  - a single document is created client-side as a guest (allowed).
//  - multiple documents go through the Bun API, which uses the server API key to
//    call the privileged bulk `createDocuments` endpoint (blocked for clients).
export async function create(docs) {
  if (!ready) return;
  const list = Array.isArray(docs) ? docs : [docs];
  if (!list.length) return;
  if (list.length === 1) {
    await db.createDocument({
      databaseId,
      collectionId,
      documentId: ID.unique(),
      data: toData(list[0]),
    });
    return;
  }
  await api("POST", "/api/documents/bulk", { documents: list });
}

// List indexes on the collection (via the Bun API).
export async function listIndexes() {
  const data = await api("GET", "/api/indexes");
  return data.indexes || [];
}

// Create an index on an arbitrary field/attribute (via the Bun API).
export async function createIndex(attribute, type = "key") {
  const data = await api("POST", "/api/indexes", { attribute, type });
  return data.index;
}

// Delete an index by its key (via the Bun API).
export async function deleteIndex(key) {
  await api("DELETE", `/api/indexes/${encodeURIComponent(key)}`);
}

// Coerce a filter value to a typed value for Appwrite queries.
function coerce(v) {
  if (typeof v !== "string") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  if (v !== "" && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

// Map one UI filter to an Appwrite Query.
function toQuery(f) {
  const p = f.path;
  switch (f.op) {
    case "eq":
      return Query.equal(p, coerce(f.value));
    case "neq":
      return Query.notEqual(p, coerce(f.value));
    case "gt":
      return Query.greaterThan(p, Number(f.value));
    case "lt":
      return Query.lessThan(p, Number(f.value));
    case "contains":
      return Query.contains(p, coerce(f.value));
    case "exists":
      return Query.isNotNull(p);
    default:
      return null;
  }
}

// Run a real DocumentsDB query for the given filters. Returns matching documents
// (newest first, up to `limit`, paged in <=100 chunks — the server max), plus
// the true total match count and elapsed time.
export async function query(filters, limit = 120) {
  if (!ready) return { documents: [], total: 0, ms: 0 };
  const base = (filters || []).map(toQuery).filter(Boolean);
  const out = [];
  let offset = 0;
  let total = 0;
  const page = 100;
  const t0 = performance.now();
  while (out.length < limit) {
    const size = Math.min(page, limit - out.length);
    const res = await db.listDocuments({
      databaseId,
      collectionId,
      queries: [...base, Query.orderDesc("$createdAt"), Query.limit(size), Query.offset(offset)],
      total: true,
    });
    total = res.total ?? total;
    const rows = res.documents || [];
    for (const r of rows) out.push(fromRow(r));
    if (rows.length < size) break;
    offset += rows.length;
  }
  return { documents: out, total, ms: performance.now() - t0 };
}

// Load documents, newest first, up to `cap`.
export async function list(cap = 4000) {
  if (!ready) return [];
  const out = [];
  const pageSize = 100;
  let offset = 0;
  while (out.length < cap) {
    const res = await db.listDocuments({
      databaseId,
      collectionId,
      queries: [Query.orderDesc("$createdAt"), Query.limit(pageSize), Query.offset(offset)],
    });
    const rows = res.documents || [];
    for (const r of rows) out.push(fromRow(r));
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return out.slice(0, cap);
}

// Delete every document in the collection.
export async function clear() {
  if (!ready) return;
  for (;;) {
    const res = await db.listDocuments({
      databaseId,
      collectionId,
      queries: [Query.limit(100)],
    });
    const rows = res.documents || [];
    if (!rows.length) break;
    await Promise.all(
      rows.map((r) => db.deleteDocument({ databaseId, collectionId, documentId: r.$id }))
    );
  }
}
