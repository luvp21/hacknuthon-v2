/**
 * Demo Conversation Service
 * Text-only ordering demo â€” delegates AI/intent logic to BrainService.
 * Returns structured JSON for the web UI.
 */

import { v4 as uuidv4 } from 'uuid';
import { SupportedLanguage } from '../../types';
import { processTurn } from '../../brain/brainService';
import {
    createSession,
    getSession,
    endSession,
    SessionContext,
    CartItem,
} from '../../conversation/sessionStore';
import { OrderService } from '../../orders/orderService';
import { query } from '../../database/postgres';
import { generateGreeting, withLLMRetry } from '../../ai/llmClient';
import { MenuService } from '../../menu/menuService';
import { env } from '../../config/env';
import { createServiceLogger } from '../../utils/logger';

const log = createServiceLogger('DemoService');

// â”€â”€ Public result types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface DemoStartResult {
    sessionId: string;
    restaurantName: string;
    reply: string;
    state: string;
    language: string;
}

export interface DemoChatResult {
    reply: string;
    state: string;
    intent?: string;
    cart: CartItem[];
    cartTotal: number;
    cartSubtotal: number;
    cartTax: number;
    upsellSuggestion?: {
        itemId: number;
        itemName: string;
        price: number;
        reason: string;
    } | null;
    orderReady: boolean;
    isComplete: boolean;
    appliedDiscount: number;
    netTotal: number;
    orderId?: string;
    kotNumber?: string;
}

// â”€â”€ Service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class DemoConversationService {
    private menuService = new MenuService();
    private orderService = new OrderService();

    // â”€â”€ Start a fresh demo session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    async startSession(
        restaurantId = env.DEFAULT_RESTAURANT_ID,
        language: SupportedLanguage = 'en',
        phone = '+911234567890'
    ): Promise<DemoStartResult> {
        const sessionId = uuidv4();

        await createSession(sessionId, restaurantId, phone, language);

        const restaurantName = await this.menuService.getRestaurantName(restaurantId);

        const FALLBACK_GREETINGS: Record<SupportedLanguage, string> = {
            en: `Welcome to ${restaurantName}! I'm your AI ordering assistant. What would you like today?`,
            hi: `${restaurantName} à¤®à¥‡à¤‚ à¤†à¤ªà¤•à¤¾ à¤¸à¥à¤µà¤¾à¤—à¤¤ à¤¹à¥ˆà¥¤ à¤†à¤œ à¤•à¥à¤¯à¤¾ à¤‘à¤°à¥à¤¡à¤° à¤•à¤°à¤¨à¤¾ à¤šà¤¾à¤¹à¥‡à¤‚à¤—à¥‡?`,
            hinglish: `${restaurantName} mein swagat hai! Aaj kya order karein?`,
        };

        let greeting: string;
        try {
            greeting = await withLLMRetry(() => generateGreeting(restaurantName, language));
        } catch (err) {
            log.warn('generateGreeting failed â€” using fallback', { error: (err as Error).message });
            greeting = FALLBACK_GREETINGS[language] ?? FALLBACK_GREETINGS.en;
        }

        log.info('Demo session started', { sessionId, restaurantId, language });
        return { sessionId, restaurantName, reply: greeting, state: 'COLLECTING_ORDER', language };
    }

    // â”€â”€ Process one user message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    async chat(sessionId: string, message: string): Promise<DemoChatResult> {
        // Resolve restaurant + phone — auto-create if missing (voice calls arrive
        // without a prior startSession call, so processTurn may not have run yet)
        let existing = await getSession(sessionId);
        if (!existing) {
            existing = await createSession(
                sessionId,
                env.DEFAULT_RESTAURANT_ID,
                '+910000000000',
                'en'
            );
            log.info('Auto-created session for voice call', { sessionId });
        }

        const output = await processTurn({
            sessionId,
            transcript: message,
            restaurantId: existing.restaurantId,
            customerPhone: existing.customerPhone,
            isVoiceCall: true,
        });

        let orderId: string | undefined;
        let kotNumber: string | undefined;

        // Order is already written to DB by saveCompletedOrder() inside handleFinalConfirmation.
        // Only fall back to orderService.createOrder() if that path didn't run (legacy demo flow).
        if (output.orderReady && output.updatedCart.length > 0 && !output.orderId) {
            try {
                // Legacy FK: ensure a call_sessions row exists for the order
                await this.upsertDemoCallSession(sessionId, existing.restaurantId, existing.customerPhone);

                const orderItems = output.updatedCart.map((ci, idx) => ({
                    id: `demo_${idx}`,
                    menu_item_id: String(ci.itemId),
                    menu_item_name: ci.name,
                    quantity: ci.qty,
                    unit_price: ci.unitPrice,
                    total_price: ci.lineTotal,
                    modifiers: [],
                }));

                const subtotal = Math.round((output.cartTotal / 1.05) * 100) / 100;
                const taxAmount = Math.round((output.cartTotal - subtotal) * 100) / 100;

                const order = await this.orderService.createOrder({
                    session_id: sessionId,
                    restaurant_id: existing.restaurantId,
                    items: orderItems,
                    language: output.language as SupportedLanguage,
                    customer_phone: existing.customerPhone,
                    subtotal,
                    tax_amount: taxAmount,
                    total_amount: output.cartTotal,
                });

                orderId = order.id;
                kotNumber = order.kot_number ?? undefined;
                log.info('Demo order created', { orderId, sessionId });
            } catch (err) {
                log.error('Demo order creation failed', { error: (err as Error).message, sessionId });
            }
        }

        const isComplete = output.nextState === 'COMPLETED' || output.nextState === 'ERROR' || output.sessionEnd;

        const cartSubtotal = Math.round((output.cartTotal / 1.05) * 100) / 100;
        const cartTax = Math.round((output.cartTotal - cartSubtotal) * 100) / 100;

        return {
            reply: output.responseText,
            state: output.nextState,
            intent: output.intent,
            cart: output.updatedCart,
            cartTotal: output.cartTotal,
            cartSubtotal,
            cartTax,
            upsellSuggestion: output.upsellSuggestion ?? null,
            orderReady: output.orderReady,
            isComplete,
            appliedDiscount: output.appliedDiscount,
            netTotal: output.netTotal,
            orderId,
            kotNumber,
        };
    }

    // â”€â”€ Get session context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    async getSession(sessionId: string): Promise<SessionContext | null> {
        return getSession(sessionId);
    }

    // â”€â”€ End session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    async endSession(sessionId: string): Promise<void> {
        await endSession(sessionId);
    }

    // â”€â”€ Legacy FK helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private async upsertDemoCallSession(
        sessionId: string,
        restaurantId: string,
        phone: string
    ): Promise<void> {
        await query(
            `INSERT INTO call_sessions
               (id, call_sid, phone_number, restaurant_id, state, language,
                conversation_history, partial_order, upsell_offered, upsell_accepted,
                upsell_shown, customer_name, retry_count, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
             ON CONFLICT (id) DO NOTHING`,
            [
                sessionId,
                `demo-${sessionId}`,
                phone,
                restaurantId,
                'COMPLETED',
                'en',
                JSON.stringify([]),
                JSON.stringify({}),
                false, false,
                JSON.stringify([]),
                null, 0,
            ]
        );
    }
}
