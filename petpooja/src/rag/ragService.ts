import { loadVectorStore, isStoreLoaded, getStoreStats } from './vectorStore'
import { routeQuery } from './retrievers/intentRouter'
import { retrieveMenuContext } from './retrievers/menuRetriever'
import { retrieveUpsellContext } from './retrievers/upsellRetriever'
import { retrieveOfferContext } from './retrievers/offerRetriever'
import { retrieveDietaryContext } from './retrievers/dietaryRetriever'
import { retrievePriceContext } from './retrievers/priceRetriever'
import { retrieveCuisineContext } from './retrievers/cuisineRetriever'
import { retrieveAvailabilityContext } from './retrievers/availabilityRetriever'
import { retrieveFeedbackContext } from './retrievers/feedbackRetriever'
import { retrieveComboContext } from './retrievers/comboRetriever'
import { retrieveInventoryContext } from './retrievers/inventoryRetriever'
import { retrieveRecommendationContext } from './retrievers/recommendationRetriever'
import { createServiceLogger } from '../utils/logger'
import type { RagContext, RetrieverType } from './types'

const logger = createServiceLogger('ragService')

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initRag(): Promise<void> {
  if (isStoreLoaded()) {
    logger.info('RAG vector store already loaded — skipping')
    return
  }
  try {
    await loadVectorStore()
    const stats = getStoreStats()
    logger.info(`RAG ready — ${stats.total} docs, ${Object.keys(stats.byType).length} types`)
  } catch (err) {
    logger.error('Failed to load RAG vector store — RAG disabled for this session', { err })
  }
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export function getRagStats(): Record<string, unknown> {
  return getStoreStats()
}

// ─── Core retrieve ───────────────────────────────────────────────────────────

export async function retrieve(
  query: string,
  cartItemIds: number[] = [],
  cartTotal: number = 0,
  customerSegment?: string
): Promise<RagContext> {
  if (!isStoreLoaded()) {
    return emptyContext(query, 'menu')
  }

  try {
    const routing = routeQuery(query, cartItemIds, cartTotal)
    logger.info('RAG routing', { primary: routing.primaryRetriever, reasoning: routing.reasoning })

    // Run primary retriever
    const primary = await runRetriever(routing.primaryRetriever, query, cartItemIds, cartTotal, customerSegment)

    // If secondaries exist, run them and merge (dedup by doc id)
    let merged = primary
    if (routing.secondaryRetrievers && routing.secondaryRetrievers.length > 0) {
      const secondaryResults = await Promise.all(
        routing.secondaryRetrievers.map((r: RetrieverType) => runRetriever(r, query, cartItemIds, cartTotal, customerSegment))
      )
      merged = mergeContexts(primary, secondaryResults, routing.reasoning)
    }

    return merged
  } catch (err) {
    logger.error('RAG retrieve error — returning empty context', { err })
    return emptyContext(query, 'menu')
  }
}

// ─── Intent-mapped retrieve ───────────────────────────────────────────────────

/**
 * Called by brainService with the structured intent from the state machine.
 * Maps named intents to retriever strategies.
 */
export async function retrieveForIntent(
  intent: string,
  transcript: string,
  cartItemIds: number[] = [],
  cartTotal: number = 0
): Promise<RagContext> {
  if (!isStoreLoaded()) {
    return emptyContext(transcript, 'menu')
  }

  try {
    switch (intent) {
      case 'ORDER_ADD':
      case 'QUERY_MENU':
        return await retrieveMenuContext(transcript)

      case 'QUERY_PRICE':
        return await retrievePriceContext(transcript, cartTotal)

      case 'QUERY_AVAILABILITY':
        return await retrieveAvailabilityContext(transcript)

      case 'CONFIRM_ORDER':
        return await retrieveOfferContext(transcript, cartTotal)

      case 'QUERY_DIETARY':
        return await retrieveDietaryContext(transcript)

      case 'QUERY_CUISINE':
        return await retrieveCuisineContext(transcript)

      case 'QUERY_COMBO':
        return await retrieveComboContext(transcript, cartItemIds)

      case 'QUERY_UPSELL':
        return await retrieveUpsellContext(transcript, cartItemIds, cartTotal)

      case 'QUERY_FEEDBACK':
        return await retrieveFeedbackContext(transcript)

      case 'SMALLTALK':
      case 'GREETING':
        return await retrieveRecommendationContext(transcript, cartItemIds)

      case 'UNKNOWN':
      default: {
        // Fan out to menu + offer + recommendation and merge
        const [menuCtx, offerCtx, recCtx] = await Promise.all([
          retrieveMenuContext(transcript),
          retrieveOfferContext(transcript, cartTotal),
          retrieveRecommendationContext(transcript, cartItemIds),
        ])
        return mergeContexts(menuCtx, [offerCtx, recCtx], `intent=${intent}`)
      }
    }
  } catch (err) {
    logger.error('retrieveForIntent error — returning empty context', { err, intent })
    return emptyContext(transcript, 'menu')
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function runRetriever(
  type: RetrieverType,
  query: string,
  cartItemIds: number[],
  cartTotal: number,
  customerSegment?: string
): Promise<RagContext> {
  switch (type) {
    case 'menu':
      return retrieveMenuContext(query)
    case 'upsell':
      return retrieveUpsellContext(query, cartItemIds, cartTotal)
    case 'offer':
      return retrieveOfferContext(query, cartTotal)
    case 'dietary':
      return retrieveDietaryContext(query)
    case 'price':
      return retrievePriceContext(query, cartTotal)
    case 'cuisine':
      return retrieveCuisineContext(query)
    case 'availability':
      return retrieveAvailabilityContext(query)
    case 'feedback':
      return retrieveFeedbackContext(query)
    case 'combo':
      return retrieveComboContext(query, cartItemIds)
    case 'inventory':
      return retrieveInventoryContext(query)
    case 'recommendation':
      return retrieveRecommendationContext(query, cartItemIds, customerSegment)
    default:
      return retrieveMenuContext(query)
  }
}

function mergeContexts(
  primary: RagContext,
  secondaries: RagContext[],
  reasoning: string
): RagContext {
  const seen = new Set<string>()
  const allResults = [...primary.results]

  for (const ctx of secondaries) {
    for (const r of ctx.results) {
      if (!seen.has(r.document.id)) {
        seen.add(r.document.id)
        allResults.push(r)
      }
    }
  }

  // Sort by score desc, take top 6
  allResults.sort((a, b) => b.score - a.score)
  const top6 = allResults.slice(0, 6)

  const topContent = (
    `=== RESTAURANT CONTEXT ===\nQuery routing: ${reasoning}\n\n` +
    top6.map((r) => r.document.content).join('\n---\n')
  ).slice(0, 2000)

  return {
    query: primary.query,
    normalizedQuery: primary.normalizedQuery,
    retrieverType: primary.retrieverType,
    results: top6,
    topContent,
    totalSearched: allResults.length,
    retrievalTimeMs: primary.retrievalTimeMs,
    fromCache: false,
  }
}

function emptyContext(query: string, retrieverType: RetrieverType): RagContext {
  return {
    query,
    normalizedQuery: query.toLowerCase().trim(),
    retrieverType,
    results: [],
    topContent: '',
    totalSearched: 0,
    retrievalTimeMs: 0,
    fromCache: false,
  }
}
