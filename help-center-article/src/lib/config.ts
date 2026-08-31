/**
 * Appwrite connection details and the shape of the vector collection.
 *
 * The collection is created with the all-minilm model, which produces 384
 * components. Every vector written to the collection must be that length.
 */
export const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1'
export const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? ''
export const API_KEY = process.env.APPWRITE_API_KEY ?? ''

export const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? 'helpcenter'
export const COLLECTION_ID = process.env.APPWRITE_COLLECTION_ID ?? 'articles'

export const EMBEDDING_MODEL = 'all-minilm'

export const CATEGORIES = [
  'Account',
  'Billing',
  'Projects',
  'Invoicing',
  'Integrations',
] as const

export type Category = (typeof CATEGORIES)[number]
