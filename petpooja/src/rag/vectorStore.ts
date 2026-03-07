import * as fs from 'fs'
import * as path from 'path'
import { createServiceLogger } from '../utils/logger'
import { EMBEDDING_DIMS } from './embedder'
import type {
  RagDocument,
  VectorStoreIndex,
  DocumentType,
  SearchOptions,
  RetrievalResult,
} from './types'
import { dotProduct } from './embedder'

const log = createServiceLogger('VectorStore')

const STORE_PATH = path.join(process.cwd(), 'rag_index.json')

let store: VectorStoreIndex | null = null
let documentMap: Map<string, RagDocument> = new Map()
let documentsByType: Map<DocumentType, RagDocument[]> = new Map()

export async function loadVectorStore(): Promise<void> {
  if (!fs.existsSync(STORE_PATH)) {
    throw new Error(
      `RAG index not found at ${STORE_PATH}. Run: npx ts-node src/rag/scripts/buildIndex.ts`
    )
  }

  const raw = fs.readFileSync(STORE_PATH, 'utf-8')
  const parsed = JSON.parse(raw) as VectorStoreIndex

  store = parsed
  documentMap = new Map()
  documentsByType = new Map()

  for (const doc of parsed.documents) {
    documentMap.set(doc.id, doc)

    const typeList = documentsByType.get(doc.type) ?? []
    typeList.push(doc)
    documentsByType.set(doc.type, typeList)
  }

  log.info(`RAG index loaded: ${parsed.totalDocuments} documents, built at ${parsed.builtAt}`)
}

export async function saveVectorStore(
  documents: RagDocument[],
  version: string = '1.0'
): Promise<void> {
  const byType: Record<string, number> = {}
  for (const doc of documents) {
    byType[doc.type] = (byType[doc.type] ?? 0) + 1
  }

  const index: VectorStoreIndex = {
    documents,
    builtAt: new Date().toISOString(),
    modelName: 'gemini/text-embedding-004',
    totalDocuments: documents.length,
    documentsByType: byType,
    restaurantId: 1,
    version,
  }

  const json = JSON.stringify(index, null, 2)
  fs.writeFileSync(STORE_PATH, json, 'utf-8')

  const sizeKb = (Buffer.byteLength(json, 'utf-8') / 1024).toFixed(1)
  log.info(`RAG index saved: ${documents.length} documents, ${sizeKb} KB → ${STORE_PATH}`)
}

export function isStoreLoaded(): boolean {
  return store !== null
}

export function getStoreStats(): {
  total: number
  byType: Record<string, number>
  builtAt: string
  version: string
} {
  if (!store) {
    return { total: 0, byType: {}, builtAt: 'never', version: 'none' }
  }
  return {
    total: store.totalDocuments,
    byType: store.documentsByType,
    builtAt: store.builtAt,
    version: store.version,
  }
}

export function search(
  queryEmbedding: number[],
  options: SearchOptions = {}
): RetrievalResult[] {
  if (!store) return []

  const {
    types,
    topK = 5,
    minScore = 0.25,
    boostItemIds = [],
    filterVeg,
    filterVegan,
    filterCuisine,
    filterAvailable,
    maxPriceFilter,
  } = options

  // 1. Build candidate set
  let candidates: RagDocument[]
  if (types && types.length > 0) {
    candidates = []
    for (const t of types) {
      const typeList = documentsByType.get(t)
      if (typeList) candidates.push(...typeList)
    }
  } else {
    candidates = store.documents
  }

  // 2. Apply metadata filters
  if (filterVeg === true) {
    candidates = candidates.filter((d) => d.metadata.isVeg === true)
  }
  if (filterVegan === true) {
    candidates = candidates.filter((d) => d.metadata.isVegan === true)
  }
  if (filterCuisine) {
    candidates = candidates.filter(
      (d) => d.metadata.cuisine === filterCuisine || d.metadata.cuisine === 'both'
    )
  }
  if (filterAvailable === true) {
    candidates = candidates.filter((d) => d.metadata.isAvailable !== false)
  }
  if (maxPriceFilter !== undefined) {
    candidates = candidates.filter(
      (d) =>
        d.metadata.sellingPrice === undefined ||
        d.metadata.sellingPrice <= maxPriceFilter
    )
  }

  // 3. Score via dot product (pre-normalized = cosine similarity)
  const scored: Array<{ doc: RagDocument; score: number }> = []
  for (const doc of candidates) {
    if (!doc.embedding || doc.embedding.length !== EMBEDDING_DIMS) continue
    let score = dotProduct(queryEmbedding, doc.embedding)

    // 4. Boost if doc matches any boostItemId
    if (boostItemIds.length > 0) {
      const docItemId = doc.metadata.itemId
      const docItemIds = doc.metadata.itemIds ?? []
      const matches = boostItemIds.some(
        (id) => id === docItemId || docItemIds.includes(id)
      )
      if (matches) score *= 1.3
    }

    // 5. Apply minScore filter
    if (score >= minScore) {
      scored.push({ doc, score })
    }
  }

  // 6. Sort descending
  scored.sort((a, b) => b.score - a.score)

  // 7. Take topK
  const top = scored.slice(0, topK)

  // 8. Return with rank
  return top.map((item, idx) => ({
    document: item.doc,
    score: item.score,
    rank: idx + 1,
  }))
}

export function searchByType(
  queryEmbedding: number[],
  types: DocumentType[],
  topK: number = 5,
  minScore: number = 0.25
): RetrievalResult[] {
  return search(queryEmbedding, { types, topK, minScore })
}

export function getById(id: string): RagDocument | undefined {
  return documentMap.get(id)
}

export function getByItemId(itemId: number): RagDocument[] {
  if (!store) return []
  return store.documents.filter((d) => d.metadata.itemId === itemId)
}

export function getByType(type: DocumentType): RagDocument[] {
  return documentsByType.get(type) ?? []
}

export function getTopUpsellTargets(limit: number = 5): RagDocument[] {
  const revDocs = documentsByType.get('revenue_score') ?? []
  return revDocs
    .filter((d) => d.metadata.isUpsellTarget === true)
    .sort((a, b) => (b.metadata.upsellPriority ?? 0) - (a.metadata.upsellPriority ?? 0))
    .slice(0, limit)
}

export function getAvailableItems(): RagDocument[] {
  return (documentsByType.get('menu_item') ?? []).filter(
    (d) => d.metadata.isAvailable !== false
  )
}

export function getLowStockItems(): RagDocument[] {
  return (documentsByType.get('inventory') ?? []).filter(
    (d) => d.metadata.isLowStock === true && d.metadata.itemId !== undefined
  )
}

export function getCombosByItemId(itemId: number): RagDocument[] {
  return (documentsByType.get('combo') ?? []).filter(
    (d) =>
      Array.isArray(d.metadata.itemIds) &&
      (d.metadata.itemIds as number[]).includes(itemId)
  )
}
