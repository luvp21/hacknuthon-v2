/**
 * buildIndex.ts — Run once to embed all documents and save rag_index.json
 *
 * Usage: npx ts-node src/rag/scripts/buildIndex.ts
 */

import { loadAllDocuments } from '../documentLoader'
import { embedBatchAndNormalize } from '../embedder'
import { saveVectorStore } from '../vectorStore'
import { createServiceLogger } from '../../utils/logger'
import type { RagDocument } from '../types'

const logger = createServiceLogger('buildIndex')

async function main(): Promise<void> {
  logger.info('Loading all documents from database…')
  const docs: RagDocument[] = await loadAllDocuments()
  logger.info(`Loaded ${docs.length} documents. Starting embedding…`)

  const BATCH = 32

  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH)
    const texts = batch.map((d) => d.content)
    const vectors = await embedBatchAndNormalize(texts)

    for (let j = 0; j < batch.length; j++) {
      batch[j].embedding = vectors[j]
    }

    logger.info(`Embedded ${Math.min(i + BATCH, docs.length)} / ${docs.length}`)
  }

  logger.info('Saving vector store to rag_index.json…')
  await saveVectorStore(docs)
  logger.info(`Done. ${docs.length} entries saved.`)

  process.exit(0)
}

main().catch((err) => {
  logger.error('buildIndex failed', { err })
  process.exit(1)
})
