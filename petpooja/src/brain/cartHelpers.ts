/**
 * Cart Helpers
 * Pure functions for cart manipulation and brain output construction.
 * No async, no DB calls — all side-effect-free.
 */

import { createServiceLogger } from '../utils/logger'
import { extractJSON, stripCodeFences } from '../utils/helpers'
import type { CartItem, SessionContext } from '../conversation/sessionStore'

const log = createServiceLogger('CartHelpers')

// ── Re-export so callers don't need a second import ───────────────────────────
export type { CartItem }

// ── BrainOutput (defined here, re-exported from brainService) ─────────────────

export interface BrainOutput {
    responseText: string;
    intent: string;
    updatedCart: CartItem[];
    cartTotal: number;
    netTotal: number;
    appliedDiscount: number;
    appliedOfferId: number | null;
    upsellSuggestion: {
        itemId: number;
        itemName: string;
        price: number;
        reason: string;
    } | null;
    offerNudge: string | null;
    orderReady: boolean;
    sessionEnd: boolean;
    callEnded: boolean;
    nextState: string;
    language: string;
    orderId: string | null;
}

// ── LLM order parse result ────────────────────────────────────────────────────

export interface LLMOrderParseResult {
    itemFound: boolean;
    itemId: number | null;
    itemName: string | null;
    unitPrice: number;
    foodCost: number;
    qty: number;
    modifiers: { type: string; label: string; priceDelta: number }[];
    modifierDelta: number;
    responseText: string;
    suggestions: string[];
    modifications?: {
        newQty?: number;
        newModifiers?: { type: string; label: string; priceDelta: number }[];
    };
    notes?: string;   // special instructions captured from speech
}

// ── Cart operations ───────────────────────────────────────────────────────────

export function addToCart(cart: CartItem[], newItem: CartItem): CartItem[] {
    const existing = cart.findIndex((i) => i.itemId === newItem.itemId)

    if (existing >= 0) {
        // Merge: add qty and recalculate
        const merged: CartItem = {
            ...cart[existing],
            qty: cart[existing].qty + newItem.qty,
            lineTotal: (cart[existing].qty + newItem.qty) *
                (newItem.unitPrice + newItem.modifiers.reduce((s, m) => s + m.priceDelta, 0)),
        }
        return cart.map((item, idx) => (idx === existing ? merged : item))
    }

    return [...cart, newItem]
}

export function removeFromCart(cart: CartItem[], itemId: number): CartItem[] {
    return cart.filter((i) => i.itemId !== itemId)
}

export function modifyCartItem(
    cart: CartItem[],
    itemId: number,
    modifications: {
        newQty?: number;
        newModifiers?: { type: string; label: string; priceDelta: number }[];
    }
): CartItem[] {
    return cart.map((item) => {
        if (item.itemId !== itemId) return item

        const modifiers = modifications.newModifiers ?? item.modifiers
        const qty = modifications.newQty ?? item.qty
        const modifierDelta = modifiers.reduce((s, m) => s + m.priceDelta, 0)
        const lineTotal = qty * (item.unitPrice + modifierDelta)

        return { ...item, qty, modifiers, lineTotal }
    })
}

export function cartTotal(cart: CartItem[]): number {
    return cart.reduce((sum, item) => sum + item.lineTotal, 0)
}

// ── LLM response parser ───────────────────────────────────────────────────────

/**
 * Parse the raw LLM text response from a brain turn into a structured result.
 * The LLM is instructed to return JSON — but we gracefully fallback to plain text
 * as responseText if JSON parsing fails.
 */
export function parseLLMOrderResult(llmText: string): LLMOrderParseResult {
    const defaults: LLMOrderParseResult = {
        itemFound: false,
        itemId: null,
        itemName: null,
        unitPrice: 0,
        foodCost: 0,
        qty: 1,
        modifiers: [],
        modifierDelta: 0,
        // Never let raw JSON bleed through to TTS — if the LLM text starts with
        // a JSON brace or a code fence, return a safe spoken fallback instead.
        responseText: (() => {
            const raw = llmText.trim()
            if (raw.startsWith('{') || raw.startsWith('[') || raw.startsWith('`')) {
                return "I'm having trouble with that request. Could you please repeat?"
            }
            return raw
        })(),
        suggestions: [],
    }

    try {
        const cleaned = stripCodeFences(llmText)
        const parsed = extractJSON<Partial<LLMOrderParseResult>>(cleaned)
        if (!parsed) return defaults

        return {
            itemFound: parsed.itemFound ?? false,
            itemId: parsed.itemId ?? null,
            itemName: parsed.itemName ?? null,
            unitPrice: parsed.unitPrice ?? 0,
            foodCost: parsed.foodCost ?? 0,
            qty: parsed.qty ?? 1,
            modifiers: parsed.modifiers ?? [],
            modifierDelta: parsed.modifierDelta ?? 0,
            responseText: (() => {
                const rt = parsed.responseText ?? ''
                if (!rt || rt.trim().startsWith('{') || rt.trim().startsWith('[') || rt.trim().startsWith('`')) {
                    // Parsed but responseText is also JSON-shaped or empty — use safe fallback
                    return "I'm having trouble with that request. Could you please repeat?"
                }
                return rt.trim()
            })(),
            suggestions: parsed.suggestions ?? [],
            modifications: parsed.modifications,
            notes: parsed.notes ?? undefined,
        }
    } catch {
        log.debug('parseLLMOrderResult: JSON parse failed, using raw text')
        return defaults
    }
}

// ── Cart summary ──────────────────────────────────────────────────────────────

export function buildCartSummary(
    cart: CartItem[],
    total: number,
    discount: number,
    netTotal: number,
    language: string
): string {
    if (cart.length === 0) {
        if (language === 'hi') return 'आपकी टोकरी खाली है।'
        if (language === 'hinglish') return 'Aapki cart abhi empty hai.'
        return 'Your cart is empty.'
    }

    const lines = cart.map((item) => {
        const modLine =
            item.modifiers.length > 0
                ? ` (${item.modifiers.map((m) => m.label).join(', ')})`
                : ''
        const noteLine = item.notes ? ` [Note: ${item.notes}]` : ''
        return `${item.qty}x ${item.name}${modLine}${noteLine} — ₹${item.lineTotal.toFixed(0)}`
    })

    const summaryLines = [...lines, `Subtotal: ₹${total.toFixed(0)}`]
    if (discount > 0) {
        summaryLines.push(`Discount: -₹${discount.toFixed(0)}`)
        summaryLines.push(`Total: ₹${netTotal.toFixed(0)}`)
    }

    return summaryLines.join('\n')
}

// ── Confirmation reprompt ─────────────────────────────────────────────────────

export function getConfirmationReprompt(language: string): string {
    if (language === 'hi') {
        return 'क्या आप ऑर्डर कन्फर्म करना चाहते हैं? हाँ या नहीं बोलिए।'
    }
    if (language === 'hinglish') {
        return 'Order confirm karna hai? Haan ya nahi boliye.'
    }
    return 'Would you like to confirm your order? Please say yes or no.'
}

// ── Brain output builder ──────────────────────────────────────────────────────

export function buildOutput(
    session: SessionContext,
    responseText: string,
    intent: string,
    nextState: string,
    upsellSuggestion: BrainOutput['upsellSuggestion'],
    offerNudge: string | null,
    cart?: CartItem[],
    total?: number,
    netTotal?: number,
    appliedDiscount?: number,
    appliedOfferId?: number | null,
    orderReady = false,
    sessionEnd = false,
    callEnded = false,
    orderId?: string | null
): BrainOutput {
    const finalCart = cart ?? session.cart
    const finalTotal = total ?? session.cartTotal
    const finalNet = netTotal ?? session.netTotal
    const finalDiscount = appliedDiscount ?? session.appliedDiscount

    return {
        responseText,
        intent,
        updatedCart: finalCart,
        cartTotal: finalTotal,
        netTotal: finalNet,
        appliedDiscount: finalDiscount,
        appliedOfferId: appliedOfferId !== undefined ? (appliedOfferId ?? null) : session.appliedOfferId,
        upsellSuggestion: upsellSuggestion ?? null,
        offerNudge: offerNudge ?? null,
        orderReady,
        sessionEnd,
        callEnded,
        nextState,
        language: session.language,
        orderId: orderId !== undefined ? (orderId ?? null) : (session.orderId ?? null),
    }
}
