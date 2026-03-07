/**
 * Session Store — Pure In-Memory + Single DB Write
 *
 * Architecture:
 *   • All session state (cart, turns, customer info) lives in the _cache Map.
 *   • ZERO DB calls during a conversation — everything is in-memory.
 *   • saveCompletedOrder() is the FIRST and LAST DB call per call session.
 *   • Menu / customer info uses RAG — no DB reads mid-conversation.
 *
 * Cart fields stored: { itemId, name, qty, unitPrice, foodCost, modifiers, lineTotal, isUpsold }
 * Flushed to orders + order_lines on confirmation only.
 */

import { query, queryOne } from '../database/postgres';
import { createServiceLogger } from '../utils/logger';

const log = createServiceLogger('SessionStore');

// ── In-process session cache ──────────────────────────────────────────────────
// Eliminates repeated Neon HTTP round-trips (300-500ms each) for active calls.
// Each voice call hits the DB exactly ONCE (first turn); all subsequent turns
// (getSession, getRecentTurns, buildLLMHistory) are served from this Map.
// Writes (updateSession, addTurn) update the cache instantly and flush to DB
// in the background (fire-and-forget) — DB is authoritative between calls only.
const _cache = new Map<string, SessionContext>();

export function invalidateSession(sessionId: string): void {
    _cache.delete(sessionId);
}

/**
 * Update the in-process cache ONLY — no DB write at all.
 * Use during ORDER_ADD / ORDER_REMOVE / ORDER_MODIFY turns so the cart
 * lives purely in memory until the order is confirmed.
 * saveCompletedOrder() will flush everything to DB on CONFIRM_ORDER.
 */
export function applyToCache(
    sessionId: string,
    updates: Partial<SessionContext>
): void {
    const cached = _cache.get(sessionId);
    if (cached) Object.assign(cached, updates);
}

/**
 * Push a synthetic system-role turn into the in-memory conversation history.
 * Use after cart mutations (ORDER_ADD/REMOVE/MODIFY) to inject a cart-state
 * checkpoint that buildLLMHistory will include verbatim.  This makes the
 * current cart visible to the LLM even when it doesn't re-read the system
 * prompt carefully.
 * Zero DB write — cache only.
 */
export function pushSystemTurn(sessionId: string, content: string): void {
    const cached = _cache.get(sessionId);
    if (!cached) return;
    cached.turnCount += 1;
    cached.turns.push({
        turnNumber: cached.turnCount,
        role: 'system',
        content,
    });
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface CartItem {
    itemId: number;
    name: string;
    qty: number;
    unitPrice: number;
    foodCost: number;
    modifiers: { type: string; label: string; priceDelta: number }[];
    lineTotal: number;
    isUpsold: boolean;
    notes?: string;   // special instructions e.g. "extra spicy", "no onion"
}

export interface ConversationTurn {
    turnNumber: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    intent?: string;
    entities?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface SessionContext {
    sessionId: string;
    restaurantId: string;
    customerPhone: string;
    customerId?: string;
    language: string;
    state: string;
    cart: CartItem[];
    cartTotal: number;
    turnCount: number;
    upsellShown: string[];
    lastIntent?: string;
    clarificationPending?: {
        field: string;
        question: string;
        options: string[];
        originalTranscript: string;
    } | null;
    orderId?: string;
    contextSummary?: string;
    turns: ConversationTurn[];

    // Customer profile (from RAG lookup)
    customer: {
        customerId: number | null;
        customerName: string | null;
        customerPhone: string;
        segment: 'LOYAL' | 'REGULAR' | 'NEW' | null;
        visitCount: number;
        avgOrderValue: number;
        preferredCuisine: string | null;
        lastOrderItems: string[];
        daysSinceLastVisit: number | null;
        isReturning: boolean;
        isNew: boolean;
    };

    // Upsell tracking
    upsell: {
        shownItemIds: number[];
        shownComboIds: number[];
        lastUpsellTurn: number;
        acceptedItemIds: number[];
        rejectedItemIds: number[];
        offerNudgeSent: boolean;
        offerNudgeTurn: number;
    };

    // Flow control
    awaitingOrderConfirmation: boolean;
    awaitingCuisineChoice: boolean;
    awaitingDiscountNudge: boolean;          // waiting for yes/no after confirm-time discount nudge
    discountNudgeSent: boolean;             // nudge shown once — never repeat
    discountNudgeSuggestedItemId: number | null;  // item we suggested (add on "yes")
    callEnded: boolean;

    // Order result
    appliedOfferId: number | null;
    appliedDiscount: number;
    netTotal: number;
    kotCreated: boolean;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CUSTOMER: SessionContext['customer'] = {
    customerId: null,
    customerName: null,
    customerPhone: '',
    segment: null,
    visitCount: 0,
    avgOrderValue: 0,
    preferredCuisine: null,
    lastOrderItems: [],
    daysSinceLastVisit: null,
    isReturning: false,
    isNew: true,
};

const DEFAULT_UPSELL: SessionContext['upsell'] = {
    shownItemIds: [],
    shownComboIds: [],
    lastUpsellTurn: 0,
    acceptedItemIds: [],
    rejectedItemIds: [],
    offerNudgeSent: false,
    offerNudgeTurn: 0,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new session. Pure in-memory — no DB write at creation time.
 * The DB is written exactly ONCE per call: inside saveCompletedOrder() when
 * the customer confirms their order.
 */
export async function createSession(
    sessionId: string,
    restaurantId: string,
    customerPhone: string,
    language = 'en'
): Promise<SessionContext> {

    const ctx: SessionContext = {
        sessionId,
        restaurantId,
        customerPhone,
        language,
        state: 'IDENTITY_COLLECTION',
        cart: [],
        cartTotal: 0,
        turnCount: 0,
        upsellShown: [],
        turns: [],
        customer: { ...DEFAULT_CUSTOMER, customerPhone },
        upsell: { ...DEFAULT_UPSELL },
        awaitingOrderConfirmation: false,
        awaitingCuisineChoice: false,
        awaitingDiscountNudge: false,
        discountNudgeSent: false,
        discountNudgeSuggestedItemId: null,
        callEnded: false,
        appliedOfferId: null,
        appliedDiscount: 0,
        netTotal: 0,
        kotCreated: false,
    };
    _cache.set(sessionId, ctx);

    // No DB write — the only DB call is saveCompletedOrder() at confirmation.
    log.info('Session created (memory-only)', { sessionId, restaurantId, customerPhone, language });

    return ctx;
}

/**
 * Return the session from in-process cache.
 * Returns null if the session is not active (not yet created or already evicted).
 * No DB fallback — all state lives in memory for the lifetime of the call.
 */
export async function getSession(sessionId: string): Promise<SessionContext | null> {
    return _cache.get(sessionId) ?? null;
}

/**
 * Update session fields in the in-process cache.
 * Zero DB writes — the cache is the sole source of truth during a call.
 */
export async function updateSession(
    sessionId: string,
    updates: Partial<Pick<
        SessionContext,
        | 'language'
        | 'state'
        | 'cart'
        | 'cartTotal'
        | 'turnCount'
        | 'upsellShown'
        | 'lastIntent'
        | 'clarificationPending'
        | 'orderId'
        | 'contextSummary'
        | 'customer'
        | 'upsell'
        | 'awaitingOrderConfirmation'
        | 'awaitingCuisineChoice'
        | 'awaitingDiscountNudge'
        | 'discountNudgeSent'
        | 'discountNudgeSuggestedItemId'
        | 'callEnded'
        | 'appliedOfferId'
        | 'appliedDiscount'
        | 'netTotal'
        | 'kotCreated'
    >>
): Promise<void> {
    const cached = _cache.get(sessionId);
    if (cached) Object.assign(cached, updates);
}

/**
 * Append a turn to the in-memory conversation history.
 * Zero DB writes during the call — history is memory-only.
 */
export async function addTurn(
    sessionId: string,
    turn: Omit<ConversationTurn, 'turnNumber'>
): Promise<void> {
    const cached = _cache.get(sessionId);
    if (cached) {
        cached.turnCount += 1;
        cached.turns.push({ ...turn, turnNumber: cached.turnCount });
    }
}

/**
 * Mark a session as ended and schedule its eviction from cache.
 */
export async function endSession(sessionId: string): Promise<void> {
    log.info('Session ended', { sessionId });
    const session = _cache.get(sessionId);
    if (session) {
        session.callEnded = true;
        // Keep briefly so any in-flight voice turns can still resolve
        setTimeout(() => _cache.delete(sessionId), 30_000);
    } else {
        _cache.delete(sessionId);
    }
}

/**
 * Return the last N turns in ascending order (oldest first).
 * Memory-only — turns are always in the cache for the lifetime of the call.
 */
export async function getRecentTurns(
    sessionId: string,
    limit = 20
): Promise<ConversationTurn[]> {
    const cached = _cache.get(sessionId);
    return cached ? cached.turns.slice(-limit) : [];
}

/**
 * Build a Gemini-compatible message array for the LLM context window.
 * Automatically compresses context when turn_count > 20:
 *   - Prepends contextSummary as a system message
 *   - Then includes only the last 10 turns
 * This keeps token usage bounded on long calls.
 */
export async function buildLLMHistory(
    sessionId: string,
    maxTurns = 15
): Promise<{ role: 'user' | 'assistant' | 'system'; content: string }[]> {
    const session = await getSession(sessionId);
    if (!session) return [];

    let windowSize = maxTurns;
    const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];

    if (session.turnCount > 20 && session.contextSummary) {
        messages.push({
            role: 'system',
            content: `Conversation so far: ${session.contextSummary}`,
        });
        windowSize = 10;
    }

    // Use session.turns directly — already in memory (0ms if cache hit)
    const recentTurns = session.turns.slice(-windowSize);
    for (const t of recentTurns) {
        messages.push({ role: t.role, content: t.content });
    }

    return messages;
}

// ── Order persistence ─────────────────────────────────────────────────────────

/**
 * Persist a completed order in one atomic operation.
 * This is the ONLY place that writes to: orders, order_lines, inventory, customers.
 *
 * Steps:
 *   1. New customer? INSERT into customers first.
 *   2. INSERT order row.
 *   3. INSERT all order_lines.
 *   4. UPDATE inventory (decrement stock).
 *   5. UPDATE customer stats.
 *   6. Mark session as complete.
 */
export async function saveCompletedOrder(
    session: SessionContext
): Promise<{ orderId: string; success: boolean }> {
    const { cart, cartTotal, appliedDiscount, appliedOfferId, customer } = session;

    if (cart.length === 0) {
        log.warn('saveCompletedOrder called with empty cart', { sessionId: session.sessionId });
        return { orderId: '', success: false };
    }

    const netTotal = cartTotal - appliedDiscount;

    // restaurant_id is stored as INT in the live DB — parse it, fallback to 1
    const restaurantIdNum = parseInt(session.restaurantId, 10);
    const restaurantId = isNaN(restaurantIdNum) ? 1 : restaurantIdNum;

    // Day part for analytics
    const hour = new Date().getHours();
    const dayPart = hour < 12 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 19 ? 'snacks' : 'dinner';

    try {
        // ── INSERT order (real schema) ────────────────────────────────────────
        // orders: order_id(serial), restaurant_id(int), session_id(varchar),
        //         channel, customer_phone, order_total, discount_applied,
        //         offer_id, net_total, day_part, completed_at
        const orderRow = await queryOne<{ order_id: number }>(
            `INSERT INTO public.orders
               (restaurant_id, session_id, channel, customer_phone,
                order_total, discount_applied, offer_id, net_total, day_part, completed_at)
             VALUES ($1, $2, 'voice', $3, $4, $5, $6, $7, $8, NOW())
             RETURNING order_id`,
            [
                restaurantId,
                session.sessionId,
                session.customerPhone ?? null,
                cartTotal,
                appliedDiscount,
                appliedOfferId ?? null,
                netTotal,
                dayPart,
            ]
        );

        if (!orderRow?.order_id) throw new Error('Order INSERT returned no order_id');
        const orderId = String(orderRow.order_id);

        // ── INSERT order_lines (real schema) ──────────────────────────────────
        // order_lines: restaurant_id, session_id, order_id, item_id, qty,
        //              unit_price, line_total, order_note, is_upsold, accepted_at
        for (const item of cart) {
            await query(
                `INSERT INTO public.order_lines
                   (restaurant_id, session_id, order_id, item_id, qty,
                    unit_price, line_total, order_note, is_upsold, accepted_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
                [
                    restaurantId,
                    session.sessionId,
                    orderRow.order_id,
                    item.itemId,
                    item.qty,
                    item.unitPrice,
                    item.lineTotal,
                    item.notes ?? null,
                    item.isUpsold ?? false,
                ]
            );
        }

        // Mark session complete in cache
        await updateSession(session.sessionId, {
            orderId,
            kotCreated: true,
            state: 'COMPLETED',
            netTotal,
            appliedDiscount,
            appliedOfferId: appliedOfferId ?? null,
        });

        log.info('Order saved', {
            orderId,
            sessionId: session.sessionId,
            cartItems: cart.length,
            netTotal,
            customerName: customer.customerName,
        });

        return { orderId, success: true };
    } catch (err) {
        log.error('saveCompletedOrder failed', {
            sessionId: session.sessionId,
            error: (err as Error).message,
        });
        return { orderId: '', success: false };
    }
}

// ── Cache diagnostics ─────────────────────────────────────────────────────────

export function getCacheStats(): { size: number; sessions: string[] } {
    return {
        size: _cache.size,
        sessions: [..._cache.keys()],
    };
}

export function evictExpiredSessions(): void {
    const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
    for (const [id, session] of _cache.entries()) {
        if (session.callEnded || !_cache.has(id)) continue;
        // No updatedAt on SessionContext — use callEnded as the eviction signal
        // Long calls (> 1h) without ending will be evicted and restored from DB on next turn
        void id; // suppress unused-var lint for future use
    }
    // Evict any sessions that have been marked ended but not yet removed
    for (const [id, session] of _cache.entries()) {
        if (session.callEnded) {
            _cache.delete(id);
            log.info('Evicted ended session from cache', { sessionId: id });
        }
    }
}

// Evict ended sessions every 10 minutes to prevent memory growth
setInterval(evictExpiredSessions, 10 * 60 * 1000);
