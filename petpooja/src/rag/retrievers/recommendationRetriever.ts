import { embedQuery } from '../embedder'
import { search, getById } from '../vectorStore'
import type { RagContext, SearchOptions } from '../types'

export async function retrieveRecommendationContext(
  query: string,
  cartItemIds?: number[],
  customerSegment?: string
): Promise<RagContext> {
  const start = Date.now()
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ')

  const queryEmbedding = await embedQuery(normalizedQuery)

  const searchOpts: SearchOptions = {
    types: ['bestseller', 'combo_narrative', 'customer_segment', 'upsell_narrative', 'day_part', 'menu_item'],
    topK: 7,
    minScore: 0.22,
  }

  // Boost items already in cart so related suggestions surface
  if (cartItemIds && cartItemIds.length > 0) {
    searchOpts.boostItemIds = cartItemIds
  }

  const results = search(queryEmbedding, searchOpts)

  // If a customer segment is given, pull that segment doc explicitly
  let segmentSection = ''
  if (customerSegment) {
    const segmentDoc = getById(`customer_segment_${customerSegment.toLowerCase().replace(/\s+/g, '_')}`)
    if (segmentDoc) {
      segmentSection = `Customer segment insight:\n${segmentDoc.content}\n\n`
    }
  }

  const elapsed = Date.now() - start

  const topContent = (
    segmentSection +
    'Recommendations:\n\n' +
    results.map((r) => r.document.content).join('\n---\n')
  ).slice(0, 2000)

  return {
    query,
    normalizedQuery,
    retrieverType: 'recommendation',
    results,
    topContent,
    totalSearched: results.length,
    retrievalTimeMs: elapsed,
    fromCache: false,
  }
}
