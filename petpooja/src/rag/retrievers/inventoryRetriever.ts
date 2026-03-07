import { embedQuery } from '../embedder'
import { search, getById } from '../vectorStore'
import type { RagContext, SearchOptions } from '../types'

export async function retrieveInventoryContext(query: string): Promise<RagContext> {
  const start = Date.now()
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ')

  const queryEmbedding = await embedQuery(normalizedQuery)

  const searchOpts: SearchOptions = {
    types: ['inventory'],
    topK: 5,
    minScore: 0.20,
  }

  const results = search(queryEmbedding, searchOpts)

  // Always include the low-stock alert doc
  const lowStockDoc = getById('inventory_low_stock_alert')
  const lowStockSection = lowStockDoc
    ? `Low stock alert:\n${lowStockDoc.content}\n\n`
    : ''

  const elapsed = Date.now() - start

  const topContent = (
    lowStockSection +
    'Inventory details:\n\n' +
    results.map((r) => r.document.content).join('\n---\n')
  ).slice(0, 2000)

  return {
    query,
    normalizedQuery,
    retrieverType: 'inventory',
    results,
    topContent,
    totalSearched: results.length,
    retrievalTimeMs: elapsed,
    fromCache: false,
  }
}
