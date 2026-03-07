import { embedQuery } from '../embedder'
import { search } from '../vectorStore'
import type { RagContext, SearchOptions } from '../types'

function extractMaxPrice(query: string): number | undefined {
  const patterns = [
    /under\s*[₹rs\.]*\s*(\d+)/i,
    /below\s*[₹rs\.]*\s*(\d+)/i,
    /less\s*than\s*[₹rs\.]*\s*(\d+)/i,
    /within\s*[₹rs\.]*\s*(\d+)/i,
    /[₹rs\.]*\s*(\d+)\s*only/i,
    /budget\s*[₹rs\.]*\s*(\d+)/i,
    /(\d+)\s*(?:rupee|rs|₹)/i,
  ]
  for (const pat of patterns) {
    const m = query.match(pat)
    if (m) return parseInt(m[1], 10)
  }
  return undefined
}

export async function retrievePriceContext(
  query: string,
  cartTotal?: number
): Promise<RagContext> {
  const start = Date.now()
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ')

  const queryEmbedding = await embedQuery(normalizedQuery)

  const searchOpts: SearchOptions = {
    types: ['price_range', 'menu_item', 'offer_eligibility', 'price_comparison'],
    topK: 6,
    minScore: 0.25,
  }

  const maxPrice = extractMaxPrice(normalizedQuery)
  if (maxPrice !== undefined) {
    searchOpts.maxPriceFilter = maxPrice
  }

  const results = search(queryEmbedding, searchOpts)
  const elapsed = Date.now() - start

  let prefix = ''
  if (cartTotal !== undefined && cartTotal > 0) {
    prefix = `Cart total: ₹${cartTotal}.\n\n`
  }
  if (maxPrice !== undefined) {
    prefix += `Customer budget: under ₹${maxPrice}.\n\n`
  }

  const topContent = (
    prefix +
    'Pricing information:\n\n' +
    results.map((r) => r.document.content).join('\n---\n')
  ).slice(0, 2000)

  return {
    query,
    normalizedQuery,
    retrieverType: 'price',
    results,
    topContent,
    totalSearched: results.length,
    retrievalTimeMs: elapsed,
    fromCache: false,
  }
}
