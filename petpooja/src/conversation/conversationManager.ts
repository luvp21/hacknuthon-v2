/**
 * Conversation Manager  (thin router)
 * Owns the Twilio/TwiML layer only.
 * All AI intent routing is delegated to BrainService.
 *
 * State machine:
 *  IDLE â†’ GREETING â†’ COLLECTING_ORDER â†’ â€¦ â†’ PROCESSING â†’ COMPLETED
 */

import { CallSession, SupportedLanguage, OrderItem } from '../types';
import { transition } from './stateMachine';
import { SessionManager } from './sessionManager';
import { MenuService } from '../menu/menuService';
import { OrderService } from '../orders/orderService';
import { processTurn } from '../brain/brainService';
import { createSession, CartItem } from '../conversation/sessionStore';
import {
    generateGreeting,
    generateGoodbye,
    withLLMRetry,
} from '../ai/llmClient';
import {
    buildVoicePrompt,
    buildHangupTwiML,
} from '../voice/ttsService';
import { createServiceLogger } from '../utils/logger';
import { env } from '../config/env';

const log = createServiceLogger('ConversationManager');

const GATHER_PATH = `${env.API_BASE_URL}/webhook/gather`;

export class ConversationManager {
    private sessionManager: SessionManager;
    private menuService: MenuService;
    private orderService: OrderService;

    constructor() {
        this.sessionManager = new SessionManager();
        this.menuService = new MenuService();
        this.orderService = new OrderService();
    }

    // â”€â”€ Greeting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * Handle the GREETING state â€” create a persistent Brain session,
     * generate a welcome message, and return TwiML.
     */
    async handleGreeting(session: CallSession): Promise<{ twiml: string }> {
        // Provision a Postgres-backed Brain session for this call
        await createSession(session.id, session.restaurant_id, session.phone_number, session.language);

        const restaurant = await this.menuService.getRestaurantName(session.restaurant_id);

        const greetingText = await withLLMRetry(() =>
            generateGreeting(restaurant, session.language)
        );

        session.state = transition(session.state, 'COLLECTING_ORDER', 'after_greeting');
        await this.sessionManager.addMessage(session, 'assistant', greetingText);

        return {
            twiml: buildVoicePrompt({
                promptText: greetingText,
                actionPath: GATHER_PATH,
                language: session.language,
                speechTimeout: 5,
            }),
        };
    }

    // â”€â”€ Main input handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * Delegate all intent routing and cart management to BrainService.
     * Use the BrainOutput to build the appropriate TwiML response.
     */
    async processUserInput(
        session: CallSession,
        transcript: string
    ): Promise<{ twiml: string }> {
        log.info('Processing user input', {
            callSid: session.call_sid,
            state: session.state,
            transcriptLen: transcript.length,
        });

        const output = await processTurn({
            sessionId: session.id,
            transcript,
            restaurantId: session.restaurant_id,
            customerPhone: session.phone_number,
            isVoiceCall: true,
        });

        // Sync Twilio session state
        try {
            session.state = transition(session.state, output.nextState as CallSession['state']);
        } catch {
            session.state = output.nextState as CallSession['state'];
        }
        session.language = output.language as SupportedLanguage;
        await this.sessionManager.updateSession(session);

        log.info('Brain output', {
            callSid: session.call_sid,
            intent: output.intent,
            nextState: output.nextState,
            orderReady: output.orderReady,
        });

        // â”€â”€ Confirmed order: persist to DB and say goodbye â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (output.orderReady && output.updatedCart.length > 0) {
            try {
                const orderItems = cartItemsToOrderItems(output.updatedCart);
                const subtotal = Math.round((output.cartTotal / 1.05) * 100) / 100;
                const taxAmount = Math.round((output.cartTotal - subtotal) * 100) / 100;

                const order = await this.orderService.createOrder({
                    session_id: session.id,
                    restaurant_id: session.restaurant_id,
                    items: orderItems,
                    language: output.language as SupportedLanguage,
                    customer_phone: session.phone_number,
                    subtotal,
                    tax_amount: taxAmount,
                    total_amount: output.cartTotal,
                });

                log.info('Order created', { orderId: order.id, sessionId: session.id });

                const goodbye = await withLLMRetry(() =>
                    generateGoodbye(order.kot_number, output.language as SupportedLanguage)
                );

                return { twiml: buildHangupTwiML(goodbye, output.language as SupportedLanguage) };
            } catch (err) {
                log.error('Order creation failed', { error: (err as Error).message });
                const errorMsg =
                    output.language === 'hi'
                        ? 'à¤®à¤¾à¤«à¤¼ à¤•à¤°à¥‡à¤‚, à¤‘à¤°à¥à¤¡à¤° à¤ªà¥à¤°à¥‹à¤¸à¥‡à¤¸ à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤¸à¤®à¤¸à¥à¤¯à¤¾ à¤¹à¥à¤ˆà¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ à¤µà¤¾à¤ªà¤¸ à¤•à¥‰à¤² à¤•à¤°à¥‡à¤‚à¥¤'
                        : 'Sorry, there was an issue processing your order. Please call back or speak to our staff.';
                return { twiml: buildHangupTwiML(errorMsg, output.language as SupportedLanguage) };
            }
        }

        // â”€â”€ Session ended (cancel / error) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (output.sessionEnd) {
            return { twiml: buildHangupTwiML(output.responseText, output.language as SupportedLanguage) };
        }

        // â”€â”€ Continue conversation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        return {
            twiml: buildVoicePrompt({
                promptText: output.responseText,
                actionPath: GATHER_PATH,
                language: output.language as SupportedLanguage,
                speechTimeout: 5,
            }),
        };
    }
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function cartItemsToOrderItems(cartItems: CartItem[]): OrderItem[] {
    return cartItems.map((ci, idx) => ({
        id: `brain_item_${idx}`,
        menu_item_id: String(ci.itemId),
        menu_item_name: ci.name,
        quantity: ci.qty,
        unit_price: ci.unitPrice,
        total_price: ci.lineTotal,
        modifiers: [],
    }));
}

