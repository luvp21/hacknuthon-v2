/**
 * testRetrieval.ts — Run 15 test queries against the loaded RAG index and print results
 *
 * Usage: npx ts-node src/rag/scripts/testRetrieval.ts
 */

import { loadVectorStore } from '../vectorStore'
import { retrieve } from '../ragService'
import { createServiceLogger } from '../../utils/logger'

const logger = createServiceLogger('testRetrieval')

const TEST_QUERIES: Array<{ label: string; query: string; cartItemIds?: number[]; cartTotal?: number }> = [
  { label: 'Menu browse',        query: 'What do you have on the menu?' },
  { label: 'Vegetarian request', query: 'Show me vegetarian options please' },
  { label: 'Vegan check',        query: 'Do you have anything vegan?' },
  { label: 'Price under 200',    query: 'What can I get under 200 rupees?' },
  { label: 'Price under 500',    query: 'Show me items under 500 rupees' },
  { label: 'Punjabi cuisine',    query: 'Tell me about your Punjabi dishes' },
  { label: 'Italian cuisine',    query: 'What Italian dishes do you serve?' },
  { label: 'Combo deals',        query: 'Any combo offers today?', cartItemIds: [1, 5] },
  { label: 'Active offers',      query: 'What discounts are available?', cartTotal: 450 },
  { label: 'Upsell trigger',     query: 'Any recommendations?', cartItemIds: [3, 7], cartTotal: 380 },
  { label: 'Availability',       query: 'Is the butter chicken available right now?' },
  { label: 'Feedback / rating',  query: 'Which dish do customers love the most?' },
  { label: 'Prep time fast',     query: 'What can I order if I am in a hurry?' },
  { label: 'Stock / inventory',  query: 'What items are running low today?' },
  { label: 'Restaurant info',    query: 'Tell me about the restaurant' },
]

async function main(): Promise<void> {
  logger.info('Loading vector store…')
  await loadVectorStore()

  let passed = 0
  let failed = 0

  for (const tc of TEST_QUERIES) {
    try {
      const ctx = await retrieve(tc.query, tc.cartItemIds ?? [], tc.cartTotal ?? 0)

      console.log(`\n${'─'.repeat(70)}`)
      console.log(`[${tc.label}]`)
      console.log(`Query   : ${tc.query}`)
      console.log(`Routed  : ${ctx.retrieverType}  (${ctx.retrievalTimeMs}ms, ${ctx.totalSearched} results)`)
      console.log('Top 3 results:')

      const top3 = ctx.results.slice(0, 3)
      if (top3.length === 0) {
        console.log('  (no results)')
      }
      for (const r of top3) {
        const preview = r.document.content.replace(/\n/g, ' ').slice(0, 120)
        console.log(`  score=${r.score.toFixed(4)}  [${r.document.type}] id=${r.document.id}`)
        console.log(`    ${preview}${r.document.content.length > 120 ? '…' : ''}`)
      }

      passed++
    } catch (err) {
      console.log(`\n[${tc.label}] FAILED: ${(err as Error).message}`)
      failed++
    }
  }

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`Results: ${passed} passed, ${failed} failed out of ${TEST_QUERIES.length} queries`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  logger.error('testRetrieval failed', { err })
  process.exit(1)
})
