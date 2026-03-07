/**
 * Recommendation Engine v3
 * Pure RAG reads — no DB queries during a call.
 * All intelligence comes from the pre-indexed vector store.
 *
 * Upsell priority:
 *   1. Combo containing the item just added  (highest value)
 *   2. Offer threshold completion nudge
 *   3. Puzzle / Star high-margin item from revenue_score docs
 *
 * Offer thresholds (seeded from public.offers):
 *   Offer 1: spend ₹500 → 10% off
 *   Offer 2: spend ₹900 → 20% off
 */

import { createServiceLogger } from '../utils/logger'
import {
    getTopUpsellTargets,
    getCombosByItemId,
    getByType,
} from '../rag/vectorStore'
import type { SessionContext, CartItem } from '../conversation/sessionStore'

const log = createServiceLogger('RecommendationEngine')

// ── Offer configuration ───────────────────────────────────────────────────────

interface OfferConfig {
    offerId: number
    threshold: number
    discountPct: number
    nudgeWindow: { min: number; max: number }
}

const OFFERS: OfferConfig[] = [
    { offerId: 1, threshold: 500, discountPct: 10, nudgeWindow: { min: 300, max: 499 } },
    { offerId: 2, threshold: 900, discountPct: 20, nudgeWindow: { min: 600, max: 899 } },
]

// ── Public types ──────────────────────────────────────────────────────────────

export interface UpsellSuggestion {
    itemId: number
    itemName: string
    price: number
    reason: string
    ruleType: 'combo' | 'offer_completion' | 'high_margin' | 'hidden_star'
}

export interface OfferNudgePayload {
    offerId: number
    amountNeeded: number
    discountPct: number
    nudgeText: string
}

// ── Offer discount ────────────────────────────────────────────────────────────

export function computeOfferDiscount(
    cartTotal: number
): { offerId: number; discountAmt: number; discountPct: number } | null {
    const eligible = OFFERS.filter((o) => cartTotal >= o.threshold)
    if (eligible.length === 0) return null
    const best = eligible[eligible.length - 1]
    const discountAmt = Math.floor((cartTotal * best.discountPct) / 100)
    return { offerId: best.offerId, discountAmt, discountPct: best.discountPct }
}

export function getOfferNudge(
    cartTotal: number,
    language: string
): OfferNudgePayload | null {
    const applicable = OFFERS.find(
        (o) => cartTotal >= o.nudgeWindow.min && cartTotal <= o.nudgeWindow.max
    )
    if (!applicable) return null

    const amountNeeded = applicable.threshold - cartTotal

    let nudgeText: string
    if (language === 'hi') {
        nudgeText = `बस ₹${amountNeeded} और जोड़िए और ${applicable.discountPct}% की छूट पाइए!`
    } else if (language === 'hinglish') {
        nudgeText = `Sirf ₹${amountNeeded} aur add karo aur ${applicable.discountPct}% discount lo!`
    } else {
        nudgeText = `Add just ₹${amountNeeded} more to get ${applicable.discountPct}% off your order!`
    }

    return { offerId: applicable.offerId, amountNeeded, discountPct: applicable.discountPct, nudgeText }
}

// ── Upsell gates ──────────────────────────────────────────────────────────────

function shouldAttemptUpsell(session: SessionContext): boolean {
    if (session.turnCount < 2) return false
    if (session.cart.length === 0) return false
    if (session.cart.length >= 6) return false
    const lastUpsell = session.upsell?.lastUpsellTurn ?? 0
    if (session.turnCount - lastUpsell < 2) return false
    return true
}

// ── Combo upsell ──────────────────────────────────────────────────────────────

function getComboUpsell(
    lastAddedItemId: number,
    session: SessionContext
): UpsellSuggestion | null {
    const comboDocs = getCombosByItemId(lastAddedItemId)
    const shownComboIds = session.upsell?.shownComboIds ?? []
    const shownItemIds = session.upsell?.shownItemIds ?? []
    const cartItemIds = session.cart.map((i: CartItem) => i.itemId)

    for (const doc of comboDocs) {
        const comboId = doc.metadata.comboId as number | undefined
        if (comboId && shownComboIds.includes(comboId)) continue

        const comboItemIds = (doc.metadata.itemIds as number[] | undefined) ?? []
        const candidates = comboItemIds.filter(
            (id) => id !== lastAddedItemId && !cartItemIds.includes(id) && !shownItemIds.includes(id)
        )
        if (candidates.length === 0) continue

        const menuItems = getByType('menu_item')
        const candidateDoc = menuItems.find((m) => m.metadata.itemId === candidates[0])
        if (!candidateDoc) continue

        const price = (candidateDoc.metadata.sellingPrice as number | undefined) ?? 0
        const name = (candidateDoc.metadata.name as string | undefined) ?? 'item'

        log.info('Combo upsell found', { comboId, suggestItemId: candidates[0], name })

        return {
            itemId: candidates[0],
            itemName: name,
            price,
            reason: `Great combo! ${name} pairs perfectly with what you just added.`,
            ruleType: 'combo',
        }
    }

    return null
}

// ── High-margin upsell ────────────────────────────────────────────────────────

function getHighMarginUpsell(session: SessionContext): UpsellSuggestion | null {
    const shownItemIds = session.upsell?.shownItemIds ?? []
    const cartItemIds = session.cart.map((i: CartItem) => i.itemId)
    const excluded = new Set([...shownItemIds, ...cartItemIds])

    const targets = getTopUpsellTargets(10)
    for (const doc of targets) {
        const itemId = doc.metadata.itemId as number | undefined
        if (!itemId || excluded.has(itemId)) continue
        if (doc.metadata.isAvailable === false) continue

        const price = (doc.metadata.sellingPrice as number | undefined) ?? 0
        const name = (doc.metadata.name as string | undefined) ?? 'item'
        const quadrant = (doc.metadata.quadrant as string | undefined) ?? ''
        const ruleType: UpsellSuggestion['ruleType'] =
            quadrant === 'hidden_star' ? 'hidden_star' : 'high_margin'

        return { itemId, itemName: name, price, reason: `You might also love: ${name}`, ruleType }
    }

    return null
}

// ── Public: get upsell suggestion ─────────────────────────────────────────────

export function getUpsellSuggestion(
    session: SessionContext,
    lastAddedItemId?: number
): UpsellSuggestion | null {
    if (!shouldAttemptUpsell(session)) return null

    if (lastAddedItemId !== undefined) {
        const combo = getComboUpsell(lastAddedItemId, session)
        if (combo) return combo
    }

    return getHighMarginUpsell(session)
}

// ── Upsell line builder ───────────────────────────────────────────────────────

export function buildUpsellLine(suggestion: UpsellSuggestion, language: string): string {
    const { itemName, price, reason } = suggestion
    if (language === 'hi') return `${reason} — ${itemName} सिर्फ ₹${price} में।`
    if (language === 'hinglish') return `${reason} — ${itemName} sirf ₹${price} mein.`
    return `${reason} — ${itemName} for just ₹${price}.`
}

