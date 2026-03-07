import axios from 'axios'
import { createServiceLogger } from '../utils/logger'

const log = createServiceLogger('Embedder')

// gemini-embedding-001 produces 3072-dim vectors.
// HuggingFace inference API was deprecated (410 Gone) in early 2026.
// Gemini's OpenAI-compatible endpoint doesn't expose embedding models,
// so we call the native Gemini REST API directly via axios.
export const EMBEDDING_DIMS = 3072
const GEMINI_EMBED_MODEL = 'gemini-embedding-001'
const GEMINI_EMBED_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const BATCH_SIZE = 20          // keep batches small to stay within rate limits
const BATCH_DELAY_MS = 200     // small pause between batches to avoid rate limits

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')
  return key
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Embed a single text string using gemini-embedding-001.
 * Returns a 3072-dimensional float32 vector.
 */
export async function embedText(text: string): Promise<number[]> {
  const key = getApiKey()
  const url = `${GEMINI_EMBED_BASE}/${GEMINI_EMBED_MODEL}:embedContent?key=${key}`
  const { data } = await axios.post(url, {
    model: `models/${GEMINI_EMBED_MODEL}`,
    content: { parts: [{ text }] },
  })
  const values: number[] = data?.embedding?.values
  if (!values || values.length === 0) {
    throw new Error('Gemini embedContent returned empty vector')
  }
  return values
}

/**
 * Embed multiple texts in batches using the native Gemini batchEmbedContents API.
 * Returns one 3072-dim vector per input text.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const key = getApiKey()
  const url = `${GEMINI_EMBED_BASE}/${GEMINI_EMBED_MODEL}:batchEmbedContents?key=${key}`
  const results: number[][] = []
  let processed = 0

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE)

    const { data } = await axios.post(url, {
      requests: chunk.map((text) => ({
        model: `models/${GEMINI_EMBED_MODEL}`,
        content: { parts: [{ text }] },
      })),
    })

    for (const emb of (data.embeddings as Array<{ values: number[] }>) ?? []) {
      results.push(emb.values ?? [])
    }

    processed += chunk.length
    log.info(`Embedded ${processed}/${texts.length} documents`)

    if (processed < texts.length) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  return results
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  if (denom === 0) return 0
  return Math.min(1, Math.max(0, dot / denom))
}

export function dotProduct(a: number[], b: number[]): number {
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result += a[i] * b[i]
  }
  return result
}

export function normalizeVector(v: number[]): number[] {
  let magnitude = 0
  for (const x of v) magnitude += x * x
  magnitude = Math.sqrt(magnitude)
  if (magnitude === 0) return new Array(v.length).fill(0) as number[]
  return v.map((x) => x / magnitude)
}

export function normalizeVectors(vs: number[][]): number[][] {
  return vs.map(normalizeVector)
}

export async function embedAndNormalize(text: string): Promise<number[]> {
  const embedding = await embedText(text)
  return normalizeVector(embedding)
}

export async function embedBatchAndNormalize(texts: string[]): Promise<number[][]> {
  const embeddings = await embedBatch(texts)
  return normalizeVectors(embeddings)
}

// LRU query cache — avoids re-embedding same query within a session
const queryCache = new Map<string, number[]>()
const queryCacheOrder: string[] = []
const CACHE_MAX = 100

export async function embedQuery(query: string): Promise<number[]> {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ')

  if (queryCache.has(normalized)) {
    return queryCache.get(normalized)!
  }

  const embedding = await embedAndNormalize(normalized)

  if (queryCache.size >= CACHE_MAX) {
    const oldest = queryCacheOrder.shift()
    if (oldest) queryCache.delete(oldest)
  }

  queryCache.set(normalized, embedding)
  queryCacheOrder.push(normalized)

  return embedding
}

export function clearQueryCache(): void {
  queryCache.clear()
  queryCacheOrder.length = 0
}

export function getQueryCacheSize(): number {
  return queryCache.size
}
