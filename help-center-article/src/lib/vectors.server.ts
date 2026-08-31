import { Client, Embeddings, ID, Query, VectorsDB } from 'node-appwrite'
import {
  API_KEY,
  COLLECTION_ID,
  DATABASE_ID,
  EMBEDDING_MODEL,
  ENDPOINT,
  PROJECT_ID,
} from './config'

export type ArticleMetadata = {
  title: string
  body: string
  category: string
  updatedAt: string
}

export type Article = {
  id: string
  metadata: ArticleMetadata
  /** Cosine distance from the search vector. Only present on search results. */
  distance?: number
}

const adminClient = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY)

const embeddings = new Embeddings(adminClient)
const vectorsDB = new VectorsDB(adminClient)

/**
 * Turn text into a vector the collection can store.
 *
 * Ask for the model the collection was created with, and the length always
 * matches. A failed embedding still returns 200, so check the error field.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  const { embeddings: results } = await embeddings.createTextEmbeddings({
    texts,
    model: EMBEDDING_MODEL as never,
  })

  return results.map((entry) => {
    if (entry.error) throw new Error(entry.error)
    return entry.embedding
  })
}

type DocumentPayload = {
  $id: string
  $distance?: number
  metadata: ArticleMetadata
}

const toArticle = (document: DocumentPayload): Article => ({
  id: document.$id,
  metadata: document.metadata,
  distance: document.$distance,
})

const collection = { databaseId: DATABASE_ID, collectionId: COLLECTION_ID }

export async function listArticles(): Promise<Article[]> {
  const result = await vectorsDB.listDocuments({
    ...collection,
    queries: [Query.orderDesc('$updatedAt'), Query.limit(100)],
  })
  return (result.documents as unknown as DocumentPayload[]).map(toArticle)
}

export async function getArticle(id: string): Promise<Article> {
  const document = await vectorsDB.getDocument({
    ...collection,
    documentId: id,
  })
  return toArticle(document as unknown as DocumentPayload)
}

/**
 * Rank every article against the question by cosine distance. The vector is the
 * only ranking signal, so a question phrased in the reader's own words still
 * reaches the article that answers it.
 *
 * createQuery posts the queries in the request body, which keeps the vector out
 * of the URL.
 */
export async function searchArticles(
  question: string,
  limit = 6,
): Promise<Article[]> {
  const [vector] = await embed([question])

  const result = await vectorsDB.createQuery({
    ...collection,
    queries: [Query.vectorCosine('embeddings', vector), Query.limit(limit)],
    total: false,
  })

  return (result.documents as unknown as DocumentPayload[]).map(toArticle)
}

/** Title and body both carry meaning, so both are embedded. */
const vectorSource = (title: string, body: string) => `${title}\n\n${body}`

const articleData = (
  vector: number[],
  input: { title: string; body: string; category: string },
) => ({
  embeddings: vector,
  metadata: {
    title: input.title,
    body: input.body,
    category: input.category,
    updatedAt: new Date().toISOString(),
  },
})

export async function createArticle(input: {
  title: string
  body: string
  category: string
}): Promise<Article> {
  const [vector] = await embed([vectorSource(input.title, input.body)])

  const document = await vectorsDB.createDocument({
    ...collection,
    documentId: ID.unique(),
    data: articleData(vector, input),
  })

  return toArticle(document as unknown as DocumentPayload)
}

export async function updateArticle(
  id: string,
  input: { title: string; body: string; category: string },
): Promise<Article> {
  const [vector] = await embed([vectorSource(input.title, input.body)])

  const document = await vectorsDB.updateDocument({
    ...collection,
    documentId: id,
    data: articleData(vector, input),
  })

  return toArticle(document as unknown as DocumentPayload)
}

export async function deleteArticle(id: string): Promise<void> {
  await vectorsDB.deleteDocument({ ...collection, documentId: id })
}
