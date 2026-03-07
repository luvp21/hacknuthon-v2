import type { RetrieverType, DocumentType } from '../types'

export interface RoutingDecision {
  primaryRetriever: RetrieverType
  secondaryRetrievers: RetrieverType[]
  boostItemIds: number[]
  documentTypes: DocumentType[]
  reasoning: string
}

export function routeQuery(
  query: string,
  cartItemIds: number[] = [],
  cartTotal: number = 0
): RoutingDecision {
  const q = query.toLowerCase().trim()

  const types: DocumentType[] = []
  let primary: RetrieverType = 'menu'
  const secondaries: RetrieverType[] = []
  let reasoning = 'default menu browse'

  // OFFER triggers — highest priority
  const offerKeywords = ['offer', 'discount', 'off', '10%', '20%', 'deal', 'save', 'saving',
    'much more', 'threshold', '500', '900', 'छूट', 'ऑफर', 'chhoot', 'offer hai',
    'koi offer', 'paisa bachao']
  if (offerKeywords.some((kw) => q.includes(kw))) {
    primary = 'offer'
    types.push('offer', 'offer_eligibility')
    reasoning = 'offer/discount query detected'
  }

  // DIETARY triggers
  const dietaryKeywords = ['veg', 'vegetarian', 'vegan', 'non-veg', 'nonveg', 'meat',
    'chicken', 'fish', 'jain', 'dairy', 'allerg', 'शाकाहारी', 'मांसाहारी',
    'shakahari', 'maansahari', 'veg item', 'veg option', 'without meat']
  if (dietaryKeywords.some((kw) => q.includes(kw))) {
    if (primary === 'menu') {
      primary = 'dietary'
      reasoning = 'dietary filter query'
    } else {
      secondaries.push('dietary')
    }
    if (!types.includes('dietary_guide')) types.push('dietary_guide')
    if (!types.includes('menu_item')) types.push('menu_item')
  }

  // PRICE triggers
  const priceKeywords = ['cheap', 'budget', 'under', 'below', 'affordable', 'expensive',
    'price', 'cost', 'how much', 'kitna', 'sasta', 'mehnga', '₹', 'rupee',
    'under 200', 'under 300', 'under 500', 'kitne ka', 'kitne mein', 'daam', 'rate']
  if (priceKeywords.some((kw) => q.includes(kw))) {
    if (primary === 'menu') {
      primary = 'price'
      reasoning = 'price/budget query'
    } else {
      secondaries.push('price')
    }
    if (!types.includes('price_range')) types.push('price_range')
    if (!types.includes('menu_item')) types.push('menu_item')
    if (!types.includes('offer_eligibility')) types.push('offer_eligibility')
  }

  // CUISINE triggers
  const cuisineKeywords = ['punjabi', 'italian', 'indian', 'continental', 'pasta', 'pizza',
    'naan', 'roti', 'dal', 'paneer', 'chicken tikka', 'पंजाबी', 'इटालियन',
    'italian food', 'punjabi food', 'desi', 'makki']
  if (cuisineKeywords.some((kw) => q.includes(kw))) {
    if (primary === 'menu') {
      primary = 'cuisine'
      reasoning = 'cuisine-type query'
    } else {
      secondaries.push('cuisine')
    }
    if (!types.includes('cuisine_overview')) types.push('cuisine_overview')
    if (!types.includes('menu_item')) types.push('menu_item')
  }

  // AVAILABILITY triggers
  const availabilityKeywords = ['available', 'stock', 'left', 'out of', 'do you have',
    'kya hai', 'milega', 'है क्या', 'today', 'right now', 'abhi', 'aaj',
    'hai kya', 'available hai', 'mil sakta', 'in stock']
  if (availabilityKeywords.some((kw) => q.includes(kw))) {
    if (primary === 'menu') {
      primary = 'availability'
      reasoning = 'availability/stock query'
    } else {
      secondaries.push('availability')
    }
    if (!types.includes('inventory')) types.push('inventory')
    if (!types.includes('menu_item')) types.push('menu_item')
  }

  // UPSELL / RECOMMENDATION triggers
  const upsellKeywords = ['recommend', 'suggest', 'popular', 'best', 'what else',
    'add', 'combo', 'goes with', 'pair', 'kya loon', 'kya order karoon',
    'anything else', 'kuch aur', 'aur kuch', 'saath mein', 'what should',
    'good dish', 'famous dish', 'must try', 'favourite']
  const hasUpsellSignal = upsellKeywords.some((kw) => q.includes(kw))
  const hasCartItems = cartItemIds.length > 0

  if (hasUpsellSignal || (hasCartItems && primary === 'menu')) {
    if (primary === 'menu') {
      primary = 'upsell'
      reasoning = hasUpsellSignal ? 'upsell/recommendation query' : 'cart-based upsell'
    } else {
      secondaries.push('upsell')
    }
    if (!types.includes('combo')) types.push('combo')
    if (!types.includes('combo_narrative')) types.push('combo_narrative')
    if (!types.includes('upsell_narrative')) types.push('upsell_narrative')
    if (!types.includes('revenue_score')) types.push('revenue_score')
  }

  // FEEDBACK / REVIEW triggers
  const feedbackKeywords = ['review', 'rating', 'tasty', 'taste', 'quality', 'how is',
    'kaisa', 'accha', 'feedback', 'customer', 'liked', 'loved', 'best dish',
    'kaisa hai', 'kaisa lagta', 'log kya kehte']
  if (feedbackKeywords.some((kw) => q.includes(kw))) {
    if (primary === 'menu') {
      primary = 'feedback'
      reasoning = 'feedback/review query'
    } else {
      secondaries.push('feedback')
    }
    if (!types.includes('feedback')) types.push('feedback')
    if (!types.includes('bestseller')) types.push('bestseller')
  }

  // PREP TIME triggers
  const prepKeywords = ['how long', 'wait', 'time', 'fast', 'quick', 'kitni der',
    'jaldi', 'ready', 'minutes', 'minute mein', 'time lagega', 'abhi ready',
    'kitna time', 'waiting time']
  if (prepKeywords.some((kw) => q.includes(kw))) {
    if (primary === 'menu') {
      primary = 'menu'
      reasoning = 'prep time query'
    }
    if (!types.includes('prep_time')) types.push('prep_time')
    if (!types.includes('menu_item_detail')) types.push('menu_item_detail')
  }

  // Default fallback — add menu types if nothing strong found
  if (types.length === 0) {
    types.push('menu_item', 'cuisine_overview')
    reasoning = 'default menu browse'
  }

  // Cart proximity to offer threshold — always check
  if (cartTotal > 400 && !secondaries.includes('offer')) {
    secondaries.push('offer')
    if (!types.includes('offer_eligibility')) types.push('offer_eligibility')
  }

  // Cart items — always boost combos
  const boostItemIds = [...cartItemIds]
  if (cartItemIds.length > 0 && !secondaries.includes('combo')) {
    secondaries.push('combo')
    if (!types.includes('combo')) types.push('combo')
  }

  return {
    primaryRetriever: primary,
    secondaryRetrievers: [...new Set(secondaries)],
    boostItemIds,
    documentTypes: [...new Set(types)],
    reasoning,
  }
}
