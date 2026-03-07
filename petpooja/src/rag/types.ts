export type DocumentType =
  | 'menu_item'
  | 'menu_item_detail'
  | 'revenue_score'
  | 'combo'
  | 'combo_narrative'
  | 'offer'
  | 'offer_eligibility'
  | 'inventory'
  | 'feedback'
  | 'customer_segment'
  | 'cuisine_overview'
  | 'dietary_guide'
  | 'price_range'
  | 'prep_time'
  | 'day_part'
  | 'restaurant_info'
  | 'bestseller'
  | 'upsell_narrative'
  | 'avoid_list'
  | 'price_comparison'
  | 'customer_profile'
  | 'customer_greeting'
  | 'customer_cuisine_offer'

export interface RagDocument {
  id: string
  type: DocumentType
  content: string
  embedding?: number[]
  metadata: RagMetadata
  createdAt: string
}

export interface RagMetadata {
  restaurantId?: number
  itemId?: number
  itemIds?: number[]
  name?: string
  names?: string[]

  sellingPrice?: number
  minPrice?: number
  maxPrice?: number
  priceRange?: string

  isVeg?: boolean
  isVegan?: boolean
  cuisine?: string
  category?: string

  isAvailable?: boolean
  currentStock?: number
  isLowStock?: boolean

  quadrant?: string
  cmRupees?: number
  cmPct?: number
  upsellPriority?: number
  isUpsellTarget?: boolean
  priceSignal?: string

  comboId?: number
  offerId?: number
  discountValue?: number
  minCartValue?: number
  confidence?: number

  keywords?: string[]
  language?: string[]
  priority?: number

  [key: string]: unknown
}

export interface RetrievalResult {
  document: RagDocument
  score: number
  rank: number
}

export type RetrieverType =
  | 'menu'
  | 'upsell'
  | 'offer'
  | 'dietary'
  | 'price'
  | 'cuisine'
  | 'availability'
  | 'feedback'
  | 'combo'
  | 'inventory'
  | 'recommendation'
  | 'all'

export interface RagContext {
  query: string
  normalizedQuery: string
  retrieverType: RetrieverType
  results: RetrievalResult[]
  topContent: string
  totalSearched: number
  retrievalTimeMs: number
  fromCache: boolean
}

export interface VectorStoreIndex {
  documents: RagDocument[]
  builtAt: string
  modelName: string
  totalDocuments: number
  documentsByType: Record<string, number>
  restaurantId: number
  version: string
}

export interface SearchOptions {
  types?: DocumentType[]
  topK?: number
  minScore?: number
  boostItemIds?: number[]
  filterVeg?: boolean
  filterVegan?: boolean
  filterCuisine?: string
  filterAvailable?: boolean
  maxPriceFilter?: number
}
