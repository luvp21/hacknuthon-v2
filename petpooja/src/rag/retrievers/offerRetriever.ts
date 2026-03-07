import { embedQuery } from '../embedder'
import { search, getByType } from '../vectorStore'
import type { RagContext, RetrievalResult } from '../types'

export async function retrieveOfferContext(
  query: string,
  cartTotal: number = 0
): Promise<RagContext> {
  const start = Date.now()
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ')

  const queryEmbedding = await embedQuery(normalizedQuery)

  // Lower threshold — offers always relevant
  const results = search(queryEmbedding, {
    types: ['offer', 'offer_eligibility', 'price_range'],
    topK: 4,
    minScore: 0.20,
  })

  // Always ensure both main offer documents are included
  const offerDocs = getByType('offer').filter(
    (d) => d.id === 'offer_1' || d.id === 'offer_2' || d.id === 'offer_overview'
  )
  const alreadyIncluded = new Set(results.map((r) => r.document.id))
  const extraResults: RetrievalResult[] = []
  for (const doc of offerDocs) {
    if (!alreadyIncluded.has(doc.id)) {
      extraResults.push({ document: doc, score: 0.5, rank: 0 })
    }
  }
  const allResults = [...results, ...extraResults]

  const elapsed = Date.now() - start

  let cartPrefix = ''
  if (cartTotal > 0) {
    const gapTo500 = Math.max(0, 500 - cartTotal)
    const gapTo900 = Math.max(0, 900 - cartTotal)
    cartPrefix =
      `Customer cart total: ₹${cartTotal}. ` +
      `Gap to ₹500 offer: ₹${gapTo500}. ` +
      `Gap to ₹900 offer: ₹${gapTo900}.\n\n`
  }

  const topContent = (
    cartPrefix + allResults.map((r) => r.document.content).join('\n---\n')
  ).slice(0, 2000)

  return {
    query,
    normalizedQuery,
    retrieverType: 'offer',
    results: allResults,
    topContent,
    totalSearched: allResults.length,
    retrievalTimeMs: elapsed,
    fromCache: false,
  }
}
