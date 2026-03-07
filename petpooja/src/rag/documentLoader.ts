import { createServiceLogger } from '../utils/logger'
import type { RagDocument } from './types'

import { loadMenuDocuments } from './documents/menuDocuments'
import { loadRevenueDocuments } from './documents/revenueDocuments'
import { loadComboDocuments } from './documents/comboDocuments'
import { loadOfferDocuments } from './documents/offerDocuments'
import { loadInventoryDocuments } from './documents/inventoryDocuments'
import { loadFeedbackDocuments } from './documents/feedbackDocuments'
import { loadCustomerSegmentDocuments } from './documents/customerSegmentDocuments'
import { loadCuisineDocuments } from './documents/cuisineDocuments'
import { loadDietaryDocuments } from './documents/dietaryDocuments'
import { loadPriceRangeDocuments } from './documents/priceRangeDocuments'
import { loadPrepTimeDocuments } from './documents/prepTimeDocuments'
import { loadDayPartDocuments } from './documents/dayPartDocuments'
import { loadRestaurantInfoDocuments } from './documents/restaurantInfoDocuments'
import { loadCustomerProfileDocuments } from './documents/customerProfileDocuments'

const log = createServiceLogger('DocumentLoader')

export async function loadAllDocuments(): Promise<RagDocument[]> {
  const now = new Date().toISOString()

  const [
    menuDocs,
    revenueDocs,
    comboDocs,
    offerDocs,
    inventoryDocs,
    feedbackDocs,
    customerProfileDocs,
  ] = await Promise.all([
    loadMenuDocuments(),
    loadRevenueDocuments(),
    loadComboDocuments(),
    loadOfferDocuments(),
    loadInventoryDocuments(),
    loadFeedbackDocuments(),
    loadCustomerProfileDocuments(),
  ])

  const syncDocs: RagDocument[] = [
    ...loadCustomerSegmentDocuments(),
    ...loadCuisineDocuments(),
    ...loadDietaryDocuments(),
    ...loadPriceRangeDocuments(),
    ...loadPrepTimeDocuments(),
    ...loadDayPartDocuments(),
    ...loadRestaurantInfoDocuments(),
  ]

  const all: RagDocument[] = [
    ...menuDocs,
    ...revenueDocs,
    ...comboDocs,
    ...offerDocs,
    ...inventoryDocs,
    ...feedbackDocs,
    ...customerProfileDocs,
    ...syncDocs,
  ]

  // Deduplicate by id — keep first occurrence
  const seenIds = new Set<string>()
  const deduped: RagDocument[] = []
  for (const doc of all) {
    if (!seenIds.has(doc.id)) {
      seenIds.add(doc.id)
      deduped.push({ ...doc, createdAt: doc.createdAt || now })
    }
  }

  const typeCount: Record<string, number> = {}
  for (const doc of deduped) {
    typeCount[doc.type] = (typeCount[doc.type] ?? 0) + 1
  }

  log.info(`Loaded ${deduped.length} documents across ${Object.keys(typeCount).length} types`, { typeCount })

  return deduped
}

export async function reloadDocuments(): Promise<RagDocument[]> {
  log.info('Reloading RAG documents...')
  return loadAllDocuments()
}
