/**
 * Customer Retriever
 * Looks up a customer by name from the pre-indexed RAG vector store.
 * No live DB reads — all data was embedded at index-build time.
 *
 * Lookup strategy:
 *   1. Extract customer name from spoken text
 *   2. O(N) scan of customer_profile docs matching metadata.customerNameNormalized
 *   3. If direct match found, fetch greeting + cuisine_offer docs
 *   4. Fallback to embedding search (minScore 0.6) if no direct match
 */

import { createServiceLogger } from '../../utils/logger'
import { getByType, getById, search } from '../vectorStore'
import { embedQuery } from '../embedder'
import type { RagDocument } from '../types'

const log = createServiceLogger('CustomerRetriever')

// ── Public types ──────────────────────────────────────────────────────────────

export interface CustomerLookupResult {
  found: boolean
  profileDoc: RagDocument | null
  greetingDoc: RagDocument | null
  cuisineOfferDoc: RagDocument | null
  customerName: string | null
  phone: string | null
  segment: 'LOYAL' | 'REGULAR' | 'NEW' | null
  visitCount: number
  preferredCuisine: string | null
  lastOrderItems: string[]
  daysSinceLastVisit: number | null
  avgOrderValue: number
  isNew: boolean
  isLoyal: boolean
}

const NOT_FOUND: CustomerLookupResult = {
  found: false,
  profileDoc: null,
  greetingDoc: null,
  cuisineOfferDoc: null,
  customerName: null,
  phone: null,
  segment: null,
  visitCount: 0,
  preferredCuisine: null,
  lastOrderItems: [],
  daysSinceLastVisit: null,
  avgOrderValue: 0,
  isNew: true,
  isLoyal: false,
}

// ── Name extraction ──────────────────────────────────────────────────────────

/**
 * Extract a customer name from speech like "I am Ravi" / "mera naam Priya hai".
 */
// Non-name words that should never match as a customer name
const _NON_NAME = new Set([
  // Affirmations / fillers
  'okay', 'ok', 'yes', 'no', 'hi', 'hello', 'hey', 'sure', 'good', 'great', 'thanks', 'thank',
  'bye', 'please', 'sorry', 'right', 'all', 'alright', 'fine', 'nice', 'well', 'yep', 'nope',
  'ah', 'uh', 'um', 'hmm', 'hm', 'oh', 'aw', 'ow', 'eh',
  // Question words
  'what', 'how', 'when', 'where', 'why', 'who',
  // Conjunctions / articles / prepositions
  'the', 'and', 'but', 'not', 'just', 'or', 'so', 'if', 'as', 'at', 'by', 'in', 'of', 'on',
  'to', 'up', 'for', 'from', 'with', 'this', 'that', 'it', 'its',
  // Common verbs
  'will', 'can', 'get', 'now', 'let', 'wait', 'hold', 'be', 'is', 'am', 'are', 'was', 'were',
  'do', 'does', 'did', 'go', 'got', 'come', 'see', 'look', 'make', 'take', 'put', 'try', 'use',
  'say', 'speak', 'talk', 'tell', 'ask', 'know', 'think', 'need', 'want', 'like', 'have', 'give',
  // Pronouns
  'you', 'we', 'they', 'she', 'him', 'her', 'i', 'my', 'me', 'your', 'our', 'their', 'its',
  // Misc
  'better', 'luck', 'both', 'some', 'more', 'less', 'much', 'many',
  // Hindi / Hinglish fillers
  'haan', 'nahi', 'kya', 'aur', 'mein', 'toh', 'bhi', 'bol', 'raha', 'hai', 'tha', 'hoon', 'hun',
  // Numbers
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'zero',
  // Food / ordering context words (should never be a customer name)
  'menu', 'order', 'food', 'dish', 'eat', 'chai', 'coffee', 'price',
])

// Multi-word phrases that should never be treated as a name even if short
const _NON_NAME_PHRASES = new Set([
  'all right', 'alright then', 'okay sure', 'okay good', 'okay fine', 'okay okay',
  'yes please', 'no thanks', 'no thank', 'i see', 'i know', 'go ahead', 'let me',
  'tell me', 'show me', 'help me', 'what is', 'how much',
])

export function extractNameFromSpeech(text: string): string | null {
  if (!text) return null

  const patterns = [
    // Explicit English introductions
    /(?:i am|i'm|my name is|name is|this is|call me|it's|its|name's)\s+([A-Za-z]+)/i,
    // Trailing patterns
    /^([A-Za-z]{3,20})\s+(?:here|speaking|calling)/i,
    // Hindi / Hinglish patterns
    /(?:mera naam|naam hai|mera naam hai|naam)\s+([A-Za-z]+)/i,
    /([A-Za-z]{3,20})\s+(?:hoon|hun|hu)\b/i,
    /(?:bola|bole|bataya|bolraha)\s+([A-Za-z]+)/i,
  ]

  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1] && m[1].length >= 2) {
      return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()
    }
  }

  // Loose fallback: 1-2 word utterance that looks like a name
  // Strip trailing AND inner punctuation (handles "Love," "Patel." etc.)
  const cleaned = text.trim().replace(/[.,!?]+$/, '').trim()

  // Reject known non-name phrases before the word-level check
  if (_NON_NAME_PHRASES.has(cleaned.toLowerCase())) return null

  const words = cleaned.split(/\s+/)
  if (words.length >= 1 && words.length <= 2) {
    // Strip any remaining punctuation from the candidate word itself
    const candidate = words[0].replace(/[^A-Za-z]/g, '')
    // Second word (if present) must also not be a non-name to accept the first
    const secondOk = words.length < 2 || !_NON_NAME.has(words[1].replace(/[^A-Za-z]/g, '').toLowerCase())
    if (
      candidate.length >= 3 &&
      candidate.length <= 20 &&
      !_NON_NAME.has(candidate.toLowerCase()) &&
      secondOk
    ) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase()
    }
  }

  return null
}

// ── Direct scan ───────────────────────────────────────────────────────────────

function scanForName(name: string): RagDocument | null {
  const normalizedInput = name.toLowerCase().trim()
  const profileDocs = getByType('customer_profile')
  for (const doc of profileDocs) {
    // Try normalized full-name match first
    const docNameNorm = ((doc.metadata.customerNameNormalized as string | undefined) ?? '').trim()
    if (docNameNorm && docNameNorm === normalizedInput) return doc
    // First-name fallback (min 3 chars to avoid false positives)
    const docFirst = docNameNorm.split(' ')[0]
    const inputFirst = normalizedInput.split(' ')[0]
    if (docFirst.length >= 3 && inputFirst.length >= 3 && docFirst === inputFirst) return doc
  }
  return null
}

function getCompanionDocs(
  customerId: number
): { greetingDoc: RagDocument | null; cuisineOfferDoc: RagDocument | null } {
  return {
    greetingDoc: getById(`customer_greeting_${customerId}`) ?? null,
    cuisineOfferDoc: getById(`customer_cuisine_offer_${customerId}`) ?? null,
  }
}

function buildResult(
  profileDoc: RagDocument,
  greetingDoc: RagDocument | null,
  cuisineOfferDoc: RagDocument | null
): CustomerLookupResult {
  const m = profileDoc.metadata
  return {
    found: true,
    profileDoc,
    greetingDoc,
    cuisineOfferDoc,
    customerName: (m.customerName as string | null) ?? null,
    phone: (m.customerPhone as string | null) ?? null,
    segment: (m.segment as 'LOYAL' | 'REGULAR' | 'NEW' | null) ?? null,
    visitCount: (m.visitCount as number | undefined) ?? 0,
    preferredCuisine: (m.preferredCuisine as string | null) ?? null,
    lastOrderItems: (m.lastOrderItems as string[] | undefined) ?? [],
    daysSinceLastVisit: (m.daysSinceLastVisit as number | null) ?? null,
    avgOrderValue: (m.avgOrderValue as number | undefined) ?? 0,
    isNew: (m.isNew as boolean | undefined) ?? false,
    isLoyal: (m.isLoyal as boolean | undefined) ?? false,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up a customer by name extracted from the spoken transcript.
 * Returns NOT_FOUND shape if no match.
 */
export async function lookupCustomerByName(
  spokenText: string
): Promise<CustomerLookupResult> {
  // Step 1: Extract name from speech
  const name = extractNameFromSpeech(spokenText)
  if (!name) {
    log.debug('No name found in speech', { text: spokenText.slice(0, 80) })
    return NOT_FOUND
  }

  log.debug('Extracted name from speech', { name })

  // Step 2: Direct O(N) scan of customer_profile docs
  const profileDoc = scanForName(name)
  if (profileDoc) {
    const customerId = profileDoc.metadata.customerId as number
    const { greetingDoc, cuisineOfferDoc } = getCompanionDocs(customerId)
    log.info('Customer found via direct scan', {
      customerId,
      name: profileDoc.metadata.customerName,
      segment: profileDoc.metadata.segment,
    })
    return buildResult(profileDoc, greetingDoc, cuisineOfferDoc)
  }

  // Step 3: Embedding fallback — search for the name as a query
  log.debug('Direct scan missed — falling back to embedding search', { name })
  try {
    const queryText = `customer name ${name}`
    const queryEmbedding = await embedQuery(queryText)
    const results = search(queryEmbedding, {
      types: ['customer_profile'],
      topK: 3,
      minScore: 0.6,
    })

    if (results.length > 0) {
      const bestDoc = results[0].document
      const customerId = bestDoc.metadata.customerId as number
      const { greetingDoc, cuisineOfferDoc } = getCompanionDocs(customerId)
      log.info('Customer found via embedding fallback', {
        customerId,
        score: results[0].score,
      })
      return buildResult(bestDoc, greetingDoc, cuisineOfferDoc)
    }
  } catch (err) {
    log.warn('Embedding search for customer failed', { error: (err as Error).message })
  }

  log.debug('Customer not found', { name })
  return NOT_FOUND
}

// ── Phone extraction ──────────────────────────────────────────────────────────

/**
 * Extract a 10-digit Indian mobile number from spoken text.
 * Handles digit words in English and Hindi/Hinglish.
 */
export function extractPhoneFromSpeech(text: string): string | null {
  if (!text) return null

  const WORD_DIGITS: Record<string, string> = {
    zero: '0', one: '1', two: '2', three: '3', four: '4',
    five: '5', six: '6', seven: '7', eight: '8', nine: '9',
    ek: '1', do: '2', teen: '3', char: '4', paanch: '5',
    chhe: '6', saat: '7', aath: '8', nau: '9', shunya: '0',
  }

  let cleaned = text
    .replace(/\b(my number is|my phone number is|number is|phone is|mobile is|call me at|it's|its|this is|haan|yes|sure|okay|ok)\b/gi, '')
    .replace(/\b(oh)\b/gi, '0')
    .trim()

  cleaned = cleaned.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ek|do|teen|char|paanch|chhe|saat|aath|nau|shunya)\b/gi,
    (m: string) => WORD_DIGITS[m.toLowerCase()] ?? m
  )

  const digitsOnly = cleaned.replace(/\D/g, '')
  const match = digitsOnly.match(/([6-9]\d{9})/)
  if (match) return match[1]

  const stripped = digitsOnly.replace(/^(\+?91|0)/, '')
  const match2 = stripped.match(/([6-9]\d{9})/)
  if (match2) return match2[1]

  return null
}

// ── Phone-based lookup ────────────────────────────────────────────────────────

/**
 * Look up a customer by phone number extracted from the spoken transcript.
 */
export async function lookupCustomerByPhone(
  spokenText: string
): Promise<CustomerLookupResult> {
  const phone10 = extractPhoneFromSpeech(spokenText)
  if (!phone10) {
    log.debug('No phone number found in speech', { text: spokenText.slice(0, 80) })
    return NOT_FOUND
  }

  log.debug('Extracted phone from speech', { phone10 })

  const profileDocs = getByType('customer_profile')
  let profileDoc: RagDocument | null = null
  for (const doc of profileDocs) {
    const stored = (doc.metadata.phoneLast10 as string | undefined)
      ?? (doc.metadata.customerPhone as string | undefined)?.replace(/\D/g, '').slice(-10)
    if (stored === phone10) { profileDoc = doc; break }
  }

  if (profileDoc) {
    const customerId = profileDoc.metadata.customerId as number
    const { greetingDoc, cuisineOfferDoc } = getCompanionDocs(customerId)
    log.info('Customer found via phone scan', { customerId })
    return buildResult(profileDoc, greetingDoc, cuisineOfferDoc)
  }

  try {
    const queryEmbedding = await embedQuery(`customer phone number ${phone10}`)
    const results = search(queryEmbedding, { types: ['customer_profile'], topK: 3, minScore: 0.6 })
    if (results.length > 0) {
      const bestDoc = results[0].document
      const customerId = bestDoc.metadata.customerId as number
      const { greetingDoc, cuisineOfferDoc } = getCompanionDocs(customerId)
      log.info('Customer found via embedding fallback (phone)', { customerId, score: results[0].score })
      return buildResult(bestDoc, greetingDoc, cuisineOfferDoc)
    }
  } catch (err) {
    log.warn('Embedding search for customer (phone) failed', { error: (err as Error).message })
  }

  log.debug('Customer not found by phone', { phone10 })
  return NOT_FOUND
}
