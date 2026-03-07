/**
 * Customer Profile Documents
 * Loads per-customer RAG documents from the DB so the Brain can do
 * a name-based lookup entirely from the vector store — no live DB
 * reads during a call.
 *
 * Three documents per customer:
 *   customer_profile         — full profile text, name indexed for direct scan
 *   customer_greeting        — pre-written greeting scripts (en/hi/hinglish)
 *   customer_cuisine_offer   — "shall we go with your usual?" (visitCount >= 2 only)
 */

import { queryMany } from '../../database/postgres'
import { createServiceLogger } from '../../utils/logger'
import type { RagDocument } from '../types'

const log = createServiceLogger('CustomerProfileDocuments')

const RESTAURANT_ID = 1

// ── DB row type ───────────────────────────────────────────────────────────────

interface CustomerRow {
  customer_id: number
  customer_name: string | null
  customer_phone: string
  customer_segment: string | null
  visit_count: number
  avg_order_value: string
  last_visit_at: string | null
  preferred_cuisine: string | null
  top_items: string | null        // JSON array of item names (from agg)
  total_spent: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normPhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null
  const ms = Date.now() - new Date(isoDate).getTime()
  return Math.floor(ms / 86_400_000)
}

function segment(row: CustomerRow): 'LOYAL' | 'REGULAR' | 'NEW' {
  if ((row.customer_segment ?? '').toUpperCase() === 'LOYAL') return 'LOYAL'
  if (row.visit_count >= 5) return 'LOYAL'
  if (row.visit_count >= 2) return 'REGULAR'
  return 'NEW'
}

function parseTopItems(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

// ── Document builders ─────────────────────────────────────────────────────────

function buildProfileDoc(row: CustomerRow, now: string): RagDocument {
  const name = row.customer_name ?? 'Unknown'
  const nameNormalized = name.toLowerCase().trim()
  const days = daysSince(row.last_visit_at)
  const seg = segment(row)
  const items = parseTopItems(row.top_items)
  const avgOV = parseFloat(row.avg_order_value) || 0
  const totalSpent = parseFloat(row.total_spent) || 0

  const content = [
    `Customer profile for ${name}.`,
    `Name: ${name}.`,
    `Segment: ${seg}. Visit count: ${row.visit_count}.`,
    `Average order value: ₹${avgOV.toFixed(0)}. Total spent: ₹${totalSpent.toFixed(0)}.`,
    days !== null ? `Last visit: ${days} day${days === 1 ? '' : 's'} ago.` : 'Last visit: unknown.',
    row.preferred_cuisine ? `Preferred cuisine: ${row.preferred_cuisine}.` : '',
    items.length > 0 ? `Favourite items: ${items.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    id: `customer_profile_${row.customer_id}`,
    type: 'customer_profile',
    content,
    metadata: {
      restaurantId: RESTAURANT_ID,
      customerId: row.customer_id,
      customerName: name,
      customerNameNormalized: nameNormalized,
      customerPhone: row.customer_phone,
      segment: seg,
      visitCount: row.visit_count,
      avgOrderValue: avgOV,
      totalSpent,
      preferredCuisine: row.preferred_cuisine ?? null,
      lastOrderItems: items,
      daysSinceLastVisit: days,
      isNew: row.visit_count === 0,
      isLoyal: seg === 'LOYAL',
    },
    createdAt: now,
  }
}

function buildGreetingDoc(row: CustomerRow, now: string): RagDocument {
  const name = row.customer_name ?? 'there'
  const seg = segment(row)
  const days = daysSince(row.last_visit_at)
  const items = parseTopItems(row.top_items)
  const firstItem = items[0] ?? 'your favourite'

  let warmth = ''
  if (seg === 'LOYAL') {
    warmth = days !== null && days <= 3 ? 'regular' : 'loyal'
  } else if (seg === 'REGULAR') {
    warmth = days !== null && days <= 7 ? 'recent' : 'familiar'
  }

  const greetingEn =
    seg === 'LOYAL'
      ? `Welcome back, ${name}! Great to hear from you again${warmth === 'regular' ? ' so soon' : ''}. Ready to place your order?`
      : seg === 'REGULAR'
      ? `Hello ${name}, nice to hear from you! What can I get for you today?`
      : `Hi there! Welcome to Tadka & Twist. What would you like to order today?`

  const greetingHi =
    seg === 'LOYAL'
      ? `वापस आने का स्वागत है, ${name}! क्या लेना है आज?`
      : seg === 'REGULAR'
      ? `नमस्ते ${name}! आज क्या ऑर्डर करना है?`
      : `नमस्ते! Tadka & Twist में आपका स्वागत है। आज क्या लेंगे?`

  const greetingHinglish =
    seg === 'LOYAL'
      ? `Arre ${name} bhai/didi, phir aa gaye! Kya khaoge aaj?`
      : seg === 'REGULAR'
      ? `Hello ${name}! Kya lena hai aaj?`
      : `Hi! Tadka & Twist mein aapka swagat hai. Kya order karoge?`

  const content = [
    `Greeting script for customer ${name}.`,
    `English: "${greetingEn}"`,
    `Hindi: "${greetingHi}"`,
    `Hinglish: "${greetingHinglish}"`,
    items.length > 0 ? `Last ordered: ${firstItem}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    id: `customer_greeting_${row.customer_id}`,
    type: 'customer_greeting',
    content,
    metadata: {
      restaurantId: RESTAURANT_ID,
      customerId: row.customer_id,
      customerName: name,
      customerPhone: row.customer_phone,
      greetingEn,
      greetingHi,
      greetingHinglish,
      segment: seg,
    },
    createdAt: now,
  }
}

function buildCuisineOfferDoc(row: CustomerRow, now: string): RagDocument | null {
  if (row.visit_count < 2) return null

  const name = row.customer_name ?? 'there'
  const items = parseTopItems(row.top_items)
  const cuisine = row.preferred_cuisine

  if (!cuisine && items.length === 0) return null

  const itemList = items.slice(0, 3).join(', ')

  const offerEn = itemList
    ? `Shall we go with your usual — ${itemList}?`
    : cuisine
    ? `Shall we go with your usual ${cuisine} favourites today?`
    : `Shall we go with your usual order today?`

  const offerHi = itemList
    ? `क्या आज वही लेंगे जो अक्सर लेते हैं — ${itemList}?`
    : `क्या आज वही ऑर्डर करें?`

  const offerHinglish = itemList
    ? `Aapka usual — ${itemList} — lage kya?`
    : `Usual cheez lage kya aaj?`

  const content = [
    `Cuisine offer script for ${name}.`,
    `Preferred cuisine: ${cuisine ?? 'mixed'}.`,
    items.length > 0 ? `Usual items: ${itemList}.` : '',
    `English: "${offerEn}"`,
    `Hindi: "${offerHi}"`,
    `Hinglish: "${offerHinglish}"`,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    id: `customer_cuisine_offer_${row.customer_id}`,
    type: 'customer_cuisine_offer',
    content,
    metadata: {
      restaurantId: RESTAURANT_ID,
      customerId: row.customer_id,
      customerName: name,
      customerPhone: row.customer_phone,
      preferredCuisine: cuisine ?? null,
      lastOrderItems: items,
      offerEn,
      offerHi,
      offerHinglish,
    },
    createdAt: now,
  }
}

// ── Public loader ─────────────────────────────────────────────────────────────

export async function loadCustomerProfileDocuments(): Promise<RagDocument[]> {
  const now = new Date().toISOString()

  let rows: CustomerRow[] = []

  try {
    rows = await queryMany<CustomerRow>(
      `SELECT
         c.id              AS customer_id,
         c.name            AS customer_name,
         c.phone           AS customer_phone,
         c.segment         AS customer_segment,
         COALESCE(c.visit_count, 0)                         AS visit_count,
         COALESCE(c.avg_order_value, 0)::text               AS avg_order_value,
         c.last_visit_at,
         c.preferred_cuisine,
         COALESCE(c.total_spent, 0)::text                   AS total_spent,
         (
           SELECT json_agg(mi.name ORDER BY COUNT(*) DESC)
           FROM public.orders o2
           JOIN public.order_lines ol ON ol.order_id = o2.id
           JOIN public.menu_items mi  ON mi.id = ol.item_id
           WHERE o2.customer_id = c.id
             AND o2.created_at >= now() - interval '90 days'
             AND o2.status NOT IN ('cancelled','failed')
           GROUP BY mi.id
           LIMIT 5
         )::text AS top_items
       FROM public.customers c
       WHERE c.restaurant_id = $1
       ORDER BY c.id`,
      [RESTAURANT_ID]
    )
  } catch (err) {
    log.warn('Customer profile query failed — skipping customer docs', {
      error: (err as Error).message,
    })
    return []
  }

  const docs: RagDocument[] = []

  for (const row of rows) {
    docs.push(buildProfileDoc(row, now))
    docs.push(buildGreetingDoc(row, now))
    const offerDoc = buildCuisineOfferDoc(row, now)
    if (offerDoc) docs.push(offerDoc)
  }

  log.info(`Loaded ${docs.length} customer profile documents for ${rows.length} customers`)

  return docs
}
