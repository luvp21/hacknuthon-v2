import { embedQuery } from '../embedder'
import { search, getLowStockItems, getAvailableItems } from '../vectorStore'
import type { RagContext, SearchOptions } from '../types'

export async function retrieveAvailabilityContext(query: string): Promise<RagContext> {
  const start = Date.now()
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ')

  const queryEmbedding = await embedQuery(normalizedQuery)

  const searchOpts: SearchOptions = {
    types: ['inventory', 'menu_item', 'menu_item_detail'],
    topK: 5,
    minScore: 0.25,
  }

  const results = search(queryEmbedding, searchOpts)

  // Always include a summary of low-stock / unavailable items
  const lowStock = getLowStockItems()
  const availableItems = getAvailableItems()

  const lowStockLine =
    lowStock.length > 0
      ? `Low stock / may run out soon: ${lowStock.join(', ')}.`
      : 'All items currently well stocked.'

  const availableLine = `Available items (${availableItems.length} total).`

  const elapsed = Date.now() - start

  const topContent = (
    `Availability summary:\n${availableLine}\n${lowStockLine}\n\n` +
    results.map((r) => r.document.content).join('\n---\n')
  ).slice(0, 2000)

  return {
    query,
    normalizedQuery,
    retrieverType: 'availability',
    results,
    topContent,
    totalSearched: results.length,
    retrievalTimeMs: elapsed,
    fromCache: false,
  }
}
