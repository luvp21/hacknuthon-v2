import { embedQuery } from '../embedder'
import { search } from '../vectorStore'
import type { RagContext, SearchOptions } from '../types'

function detectCuisine(query: string): 'punjabi' | 'italian' | null {
  const punjabi = ['punjabi', 'indian', 'dal', 'paneer', 'naan', 'roti', 'butter chicken', 'tikka', 'masala', 'biryani', 'lassi', 'paratha']
  const italian = ['italian', 'pizza', 'pasta', 'risotto', 'garlic bread', 'tiramisu', 'bruschetta', 'spaghetti', 'penne', 'fettuccine']
  const q = query.toLowerCase()
  if (punjabi.some((w) => q.includes(w))) return 'punjabi'
  if (italian.some((w) => q.includes(w))) return 'italian'
  return null
}

export async function retrieveCuisineContext(query: string): Promise<RagContext> {
  const start = Date.now()
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ')

  const queryEmbedding = await embedQuery(normalizedQuery)

  const searchOpts: SearchOptions = {
    types: ['cuisine_overview', 'menu_item', 'dietary_guide'],
    topK: 6,
    minScore: 0.28,
  }

  const detectedCuisine = detectCuisine(normalizedQuery)
  if (detectedCuisine) {
    searchOpts.filterCuisine = detectedCuisine
  }

  const results = search(queryEmbedding, searchOpts)
  const elapsed = Date.now() - start

  const topContent = (
    (detectedCuisine ? `Cuisine focus: ${detectedCuisine}.\n\n` : '') +
    'Cuisine information:\n\n' +
    results.map((r) => r.document.content).join('\n---\n')
  ).slice(0, 2000)

  return {
    query,
    normalizedQuery,
    retrieverType: 'cuisine',
    results,
    topContent,
    totalSearched: results.length,
    retrievalTimeMs: elapsed,
    fromCache: false,
  }
}
