import { embedQuery } from '../embedder'
import { search } from '../vectorStore'
import type { RagContext, SearchOptions } from '../types'

export async function retrieveComboContext(
  query: string,
  cartItemIds?: number[]
): Promise<RagContext> {
  const start = Date.now()
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ')

  const queryEmbedding = await embedQuery(normalizedQuery)

  const searchOpts: SearchOptions = {
    types: ['combo', 'combo_narrative', 'offer'],
    topK: 4,
    minScore: 0.22,
  }

  if (cartItemIds && cartItemIds.length > 0) {
    searchOpts.boostItemIds = cartItemIds
  }

  const results = search(queryEmbedding, searchOpts)
  const elapsed = Date.now() - start

  const topContent = (
    'Combo deals and bundles:\n\n' +
    results.map((r) => r.document.content).join('\n---\n')
  ).slice(0, 2000)

  return {
    query,
    normalizedQuery,
    retrieverType: 'combo',
    results,
    topContent,
    totalSearched: results.length,
    retrievalTimeMs: elapsed,
    fromCache: false,
  }
}
