# Help center with semantic search

A help center built with TanStack Start and Appwrite VectorsDB. Readers ask a
question in their own words and answers are ranked by meaning rather than by
keyword, so "my card got rejected" finds the article titled "What to do when a
card payment is declined".

Companion repo for the tutorial on the Appwrite blog.

## What it does

- Stores each article as one VectorsDB document: an `embeddings` vector plus a
  `metadata` object holding the title, body, category, and timestamp.
- Generates embeddings with Appwrite's built-in `all-minilm` model, so no
  external embedding provider is needed.
- Ranks search results with a `vectorCosine` query and shows the returned
  `$distance` as a similarity on a fixed scale.
- Suggests related articles on each article page using the same query.
- Gates authoring behind an Appwrite email and password session, created server
  side so the session secret never reaches the browser.
- Re-embeds an article on every save, so an edit updates the ranking too.

## Stack

- TanStack Start (React 19, Vite)
- `node-appwrite` server SDK
- Tailwind CSS v4


## Appwrite setup

In the Appwrite Console, create:

1. A project. Copy the **Project ID** and **API endpoint** from the overview
   page.
2. A **VectorsDB** database. Note its ID.
3. A collection inside it named `Articles`, with the **all-minilm** embedding
   model selected. The model sets the dimension, so every vector is 384
   components.
4. A user to sign in with, under **Auth**.
5. An API key with these scopes:

   | Scope               | Used for                                   |
   | ------------------- | ------------------------------------------ |
   | `embeddings.write`  | Turning text into vectors                  |
   | `documents.read`    | Reading and searching articles             |
   | `documents.write`   | Publishing, editing, and deleting articles |
   | `collections.write` | Creating the vector index                  |
   | `sessions.write`    | Signing an author in from the server       |

Then create the HNSW index. The index type must match the query metric, so a
cosine query needs `hnsw_cosine`:

```ts
import { Client, VectorsDB, VectorsDBIndexType } from 'node-appwrite'

const client = new Client()
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('<PROJECT_ID>')
  .setKey('<YOUR_API_KEY>')

await new VectorsDB(client).createIndex({
  databaseId: '<DATABASE_ID>',
  collectionId: '<COLLECTION_ID>',
  key: 'embeddings_cosine',
  type: VectorsDBIndexType.HnswCosine,
  attributes: ['embeddings'],
})
```

## Local development

```bash
pnpm install
cp .env.example .env
# edit .env with your project values
pnpm seed   # publishes ten starter articles
pnpm dev
```

The app runs on http://localhost:3100. Authoring is at `/admin`.

## Environment variables

See `.env.example`. Every value is read on the server only, so none are exposed
to the browser and `APPWRITE_API_KEY` stays secret.

| Variable                 | Example                                 |
| ------------------------ | --------------------------------------- |
| `APPWRITE_ENDPOINT`      | `https://fra.cloud.appwrite.io/v1`      |
| `APPWRITE_PROJECT_ID`    | your project ID                         |
| `APPWRITE_API_KEY`       | your API key                            |
| `APPWRITE_DATABASE_ID`   | your VectorsDB database ID              |
| `APPWRITE_COLLECTION_ID` | your collection ID                      |
| `SESSION_SECRET`         | a long random string for cookie sealing |

## Project structure

```
src/
  lib/
    config.ts            Connection details and the embedding model
    vectors.server.ts    Embeddings, search, and article CRUD
    auth.server.ts       Server-side sign in and session reads
  routes/
    index.tsx            Search page and category listing
    article.$id.tsx      Article page with related answers
    admin.tsx            Sign in and the authoring screen
  components/
    ProximityRuler.tsx   Plots each result on a fixed similarity scale
scripts/
  seed.mjs               Publishes the starter articles
```

## Deploy to Appwrite Sites

Push this repo to GitHub, then in your Appwrite project open **Sites**, choose
**Create site**, and connect the repository. Pick **TanStack Start** as the
framework and confirm the build settings:

| Setting          | Value           |
| ---------------- | --------------- |
| Install command  | `npm install`   |
| Build command    | `npm run build` |
| Output directory | `./dist`        |

Add every variable from the table above under the site's environment variables,
then deploy.

## Scripts

| Command      | What it does                      |
| ------------ | --------------------------------- |
| `pnpm dev`   | Start the dev server on port 3100 |
| `pnpm build` | Build for production              |
| `pnpm start` | Serve the production build        |
| `pnpm seed`  | Publish the starter articles      |
| `pnpm check` | Type-check with `tsc --noEmit`    |

## License

MIT.
