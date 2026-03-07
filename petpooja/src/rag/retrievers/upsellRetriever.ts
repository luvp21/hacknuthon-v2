import { embedQuery } from '../embedder'
import { search, getByType } from '../vectorStore'
import type { RagContext, RetrievalResult } from '../types'

export async function retrieveUpsellContext(
  query: string,
  cartItemIds: number[] = [],
  _cartTotal: number = 0
): Promise<RagContext> {
  const start = Date.now()
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ')

  const queryEmbedding = await embedQuery(normalizedQuery)

  // Main upsell search (exclude avoid_list from positive results)
  const positiveResults = search(queryEmbedding, {
    types: ['combo', 'combo_narrative', 'upsell_narrative', 'revenue_score', 'bestseller'],
    topK: 5,
    minScore: 0.25,
    boostItemIds: cartItemIds,
  })

  // Always pull top 2 avoid_list docs to know what NOT to suggest
  const avoidDocs = getByType('avoid_list').slice(0, 2)
  const avoidResults: RetrievalResult[] = avoidDocs.map((doc, idx) => ({
    document: doc,
    score: 0,
    rank: idx + 1,
  }))

  const elapsed = Date.now() - start

  const upsellContent = positiveResults.map((r) => r.document.content).join('\n---\n')
  const avoidContent = avoidResults.map((r) => r.document.content).join('\n---\n')

  const topContent = (
    '=== WHAT TO SUGGEST ===\n' +
    upsellContent +
    '\n\n=== DO NOT SUGGEST ===\n' +
    avoidContent
  ).slice(0, 2000)

  return {
    query,
    normalizedQuery,
    retrieverType: 'upsell',
    results: positiveResults,
    topContent,
    totalSearched: positiveResults.length,
    retrievalTimeMs: elapsed,
    fromCache: false,
  }
}
