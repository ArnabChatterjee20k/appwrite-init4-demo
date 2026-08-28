// Bun fullstack server:
//  - serves the React app (HTML bundling + hot reload)
//  - exposes privileged /api endpoints backed by the server SDK (node-appwrite)
//    using the Appwrite API key, which stays on the server:
//      POST   /api/documents/bulk   bulk create (createDocuments — API-key only)
//      GET    /api/indexes          list indexes
//      POST   /api/indexes          create an index on any key/attribute
//      DELETE /api/indexes/:key     delete an index
//
// Single-document create / list / delete stay client-side as a guest.

import { Client, DocumentsDB, ID, Query } from "node-appwrite";
import index from "./index.html";

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID;
const collectionId = process.env.APPWRITE_TABLE_ID;

const configured = Boolean(endpoint && projectId && apiKey && databaseId && collectionId);

let db = null;
if (configured) {
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  db = new DocumentsDB(client);
} else {
  console.warn("[server] Appwrite not fully configured — /api returns 503. Check .env.");
}

function toData(doc) {
  const out = {};
  for (const k in doc) {
    if (k === "_id" || k === "_new" || k[0] === "$") continue;
    out[k] = doc[k];
  }
  return out;
}
function fromRow(row) {
  const out = {};
  for (const k in row) if (k[0] !== "$") out[k] = row[k];
  out._id = row.$id;
  if (!out.ts) out.ts = row.$createdAt;
  return out;
}

const json = (obj, status = 200) => Response.json(obj, { status });
const guard = (fn) => async (req) => {
  if (!configured) return json({ error: "server not configured — check .env" }, 503);
  try {
    return await fn(req);
  } catch (err) {
    return json({ error: err.message || String(err), code: err.code, type: err.type }, err.code || 500);
  }
};

// Sanitize an arbitrary field path into a valid Appwrite index key.
const indexKeyFor = (attr) => "idx_" + String(attr).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const server = Bun.serve({
  port: Number(process.env.PORT || 3000),
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/api/health": () => json({ configured }),

    "/api/documents/bulk": {
      POST: guard(async (req) => {
        const body = await req.json();
        const list = Array.isArray(body?.documents) ? body.documents : [];
        if (!list.length) return json({ documents: [] });
        const res = await db.createDocuments({
          databaseId,
          collectionId,
          documents: list.map((d) => ({ $id: ID.unique(), ...toData(d) })),
        });
        return json({ documents: (res.documents || []).map(fromRow) });
      }),
    },

    "/api/indexes": {
      GET: guard(async () => {
        const res = await db.listIndexes({ databaseId, collectionId });
        return json({ indexes: res.indexes || [] });
      }),
      POST: guard(async (req) => {
        const body = await req.json();
        const attribute = String(body?.attribute || "").trim();
        if (!attribute) return json({ error: "attribute is required" }, 400);
        const type = body?.type || "key"; // key | fulltext | unique
        const key = body?.key || indexKeyFor(attribute);
        const idx = await db.createIndex({
          databaseId,
          collectionId,
          key,
          type,
          attributes: [attribute],
        });
        return json({ index: idx });
      }),
    },

    "/api/indexes/:key": {
      DELETE: guard(async (req) => {
        const key = req.params.key;
        await db.deleteIndex({ databaseId, collectionId, key });
        return json({ ok: true });
      }),
    },

    "/*": index,
  },
});

console.log(`[server] DocumentsDB Log Explorer on http://localhost:${server.port}`);
