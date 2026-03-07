import { embedQuery } from '../embedder'
import { search } from '../vectorStore'
import type { RagContext, SearchOptions } from '../types'

export async function retrieveDietaryContext(query: string): Promise<RagContext> {
  const start = Date.now()
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ')

  const queryEmbedding = await embedQuery(normalizedQuery)

  const searchOpts: SearchOptions = {
    types: ['dietary_guide', 'menu_item', 'menu_item_detail'],
    topK: 6,
    minScore: 0.28,
  }

  // Detect dietary requirement from query
  if (
    normalizedQuery.includes('vegan') ||
    normalizedQuery.includes('plant-based') ||
    normalizedQuery.includes('no dairy')
  ) {
    searchOpts.filterVegan = true
  } else if (
    normalizedQuery.includes('veg') &&
    !normalizedQuery.includes('non-veg') &&
    !normalizedQuery.includes('nonveg') &&
    !normalizedQuery.includes('chicken') &&
    !normalizedQuery.includes('fish') &&
    !normalizedQuery.includes('meat')
  ) {
    searchOpts.filterVeg = true
  }

  const results = search(queryEmbedding, searchOpts)
  const elapsed = Date.now() - start

  const topContent = (
    'Dietary information:\n\n' +
    results.map((r) => r.document.content).join('\n---\n')
  ).slice(0, 2000)

  return {
    query,
    normalizedQuery,
    retrieverType: 'dietary',
    results,
    topContent,
    totalSearched: results.length,
    retrievalTimeMs: elapsed,
    fromCache: false,
  }
}
