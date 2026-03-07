import { embedQuery } from '../embedder'
import { search } from '../vectorStore'
import type { RagContext, SearchOptions } from '../types'

export async function retrieveFeedbackContext(query: string): Promise<RagContext> {
  const start = Date.now()
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ')

  const queryEmbedding = await embedQuery(normalizedQuery)

  const searchOpts: SearchOptions = {
    types: ['feedback', 'bestseller', 'revenue_score'],
    topK: 4,
    minScore: 0.25,
  }

  const results = search(queryEmbedding, searchOpts)
  const elapsed = Date.now() - start

  const topContent = (
    'Customer feedback and ratings:\n\n' +
    results.map((r) => r.document.content).join('\n---\n')
  ).slice(0, 2000)

  return {
    query,
    normalizedQuery,
    retrieverType: 'feedback',
    results,
    topContent,
    totalSearched: results.length,
    retrievalTimeMs: elapsed,
    fromCache: false,
  }
}
