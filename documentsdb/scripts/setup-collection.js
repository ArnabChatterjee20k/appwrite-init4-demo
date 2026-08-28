// One-time setup: grant `any` create/read/update/delete on the DocumentsDB
// collection so the browser client can store & query documents.
//
// Requires a server API key with the Databases (collections.write) scope.
// Run with:  bun run setup
//
// Uses the server SDK (node-appwrite). The API key is read from .env (which Bun
// loads automatically) and is NEVER bundled into the browser app.

import { Client, DocumentsDB, Permission, Role } from "node-appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID;
const collectionId = process.env.APPWRITE_TABLE_ID;

const missing = Object.entries({
  APPWRITE_ENDPOINT: endpoint,
  APPWRITE_PROJECT_ID: projectId,
  APPWRITE_API_KEY: apiKey,
  APPWRITE_DATABASE_ID: databaseId,
  APPWRITE_TABLE_ID: collectionId,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error("[setup] missing .env values:", missing.join(", "));
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new DocumentsDB(client);

const permissions = [
  Permission.create(Role.any()),
  Permission.read(Role.any()),
  Permission.update(Role.any()),
  Permission.delete(Role.any()),
];

try {
  const col = await db.getCollection({ databaseId, collectionId });
  console.log(`[setup] collection: ${col.name} (${col.$id})`);
  const updated = await db.updateCollection({
    databaseId,
    collectionId,
    name: col.name,
    permissions,
    // Keep collection-level security (documentSecurity stays as-is on the server
    // default); collection permissions above are enough for anonymous access.
  });
  console.log("[setup] permissions now:", updated.$permissions);
  console.log("[setup] done — the browser can now create/read/delete documents.");
} catch (err) {
  console.error("[setup] failed:", err.code || "", err.message || err);
  if (err.code === 401) {
    console.error("        -> the API key needs the Databases (collections.write) scope.");
  }
  process.exit(1);
}
