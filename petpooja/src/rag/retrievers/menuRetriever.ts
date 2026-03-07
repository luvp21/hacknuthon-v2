import { embedQuery } from '../embedder'
import { search } from '../vectorStore'
import type { RagContext, SearchOptions } from '../types'

export async function retrieveMenuContext(
  query: string,
  options?: Partial<SearchOptions>
): Promise<RagContext> {
  const start = Date.now()
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ')

  const queryEmbedding = await embedQuery(normalizedQuery)

  const searchOpts: SearchOptions = {
    types: ['menu_item', 'menu_item_detail', 'cuisine_overview'],
    topK: 6,
    minScore: 0.30,
    ...options,
  }

  // Post-process: dietary filters
  if (normalizedQuery.includes('vegan')) {
    searchOpts.filterVegan = true
  } else if (normalizedQuery.includes('veg') && !normalizedQuery.includes('non-veg') && !normalizedQuery.includes('nonveg')) {
    searchOpts.filterVeg = true
  }

  // Detect cuisine boost
  if (normalizedQuery.includes('punjabi') || normalizedQuery.includes('indian')) {
    searchOpts.filterCuisine = 'Punjabi'
  } else if (normalizedQuery.includes('italian') || normalizedQuery.includes('continental')) {
    searchOpts.filterCuisine = 'Italian'
  }

  const results = search(queryEmbedding, searchOpts)
  const elapsed = Date.now() - start

  const topContent =
    'Menu items (ALWAYS use the ItemID value as itemId when adding to cart):\n\n' +
    results.map((r) => {
      const meta = r.document.metadata
      const id = meta.itemId as number | undefined
      const price = meta.sellingPrice as number | undefined
      const fc = meta.foodCost as number | undefined
      const parts: string[] = []
      if (id !== undefined) parts.push(`[ItemID:${id}]`)
      if (price !== undefined) parts.push(`[Price:₹${price}]`)
      if (fc !== undefined) parts.push(`[FoodCost:₹${fc}]`)
      const prefix = parts.length ? parts.join(' ') + ' ' : ''
      return prefix + r.document.content
    }).join('\n---\n')

  return {
    query,
    normalizedQuery,
    retrieverType: 'menu',
    results,
    topContent: topContent.slice(0, 2000),
    totalSearched: results.length,
    retrievalTimeMs: elapsed,
    fromCache: false,
  }
}
