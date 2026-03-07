/**
 * inspectIndex.ts — Print stats and a sample of each document type in rag_index.json
 *
 * Usage: npx ts-node src/rag/scripts/inspectIndex.ts
 */

import { loadVectorStore, getStoreStats, getByType } from '../vectorStore'
import { createServiceLogger } from '../../utils/logger'

const logger = createServiceLogger('inspectIndex')

async function main(): Promise<void> {
  logger.info('Loading rag_index.json…')
  await loadVectorStore()

  const stats = getStoreStats()
  console.log('\n=== RAG INDEX STATS ===')
  console.log(`Total documents : ${stats.total}`)
  console.log(`Built at        : ${stats.builtAt}`)
  console.log(`Version         : ${stats.version}`)

  if (stats.byType && Object.keys(stats.byType).length > 0) {
    console.log('\n=== DOCUMENTS BY TYPE ===')
    const sorted = Object.entries(stats.byType).sort(
      ([, a], [, b]) => b - a
    )
    for (const [type, count] of sorted) {
      console.log(`  ${type.padEnd(35)} ${count}`)
    }
  }

  // Sample first 3 docs per type
  const allTypes = Object.keys(stats.byType ?? {})
  if (allTypes.length > 0) {
    console.log('\n=== SAMPLE DOCS (first 3 per type, 200 chars) ===')
    for (const type of allTypes) {
      const docs = getByType(type as never).slice(0, 3)
      for (const doc of docs) {
        const preview = doc.content.replace(/\n/g, ' ').slice(0, 200)
        console.log(`\n[${type}] id=${doc.id}`)
        console.log(`  ${preview}${doc.content.length > 200 ? '…' : ''}`)
      }
    }
  }

  process.exit(0)
}

main().catch((err) => {
  logger.error('inspectIndex failed', { err })
  process.exit(1)
})
