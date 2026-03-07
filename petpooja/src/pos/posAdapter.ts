/**
 * POS Adapter Interface
 * Defines the contract all POS adapters must implement.
 * Add new adapters (Petpooja, UrbanPiper, POSist) by extending BasePOSAdapter.
 */

import {
    POSOrderPayload,
    POSResponse,
    Order,
    OrderItem,
    POSLineItem,
} from '../types';
import { createServiceLogger } from '../utils/logger';

const log = createServiceLogger('POSAdapter');

// ── Adapter interface ─────────────────────────────────────────────────────────
export interface IPOSAdapter {
    readonly name: string;
    submitOrder(payload: POSOrderPayload): Promise<POSResponse>;
    checkHealth(): Promise<boolean>;
}

// ── Base adapter with common helpers ─────────────────────────────────────────
export abstract class BasePOSAdapter implements IPOSAdapter {
    abstract readonly name: string;
    abstract submitOrder(payload: POSOrderPayload): Promise<POSResponse>;
    abstract checkHealth(): Promise<boolean>;

    /**
     * Convert our Order model to a generic POSOrderPayload.
     */
    protected orderToPayload(order: Order): POSOrderPayload {
        const posItems: POSLineItem[] = order.items.map((item: OrderItem) => ({
            pos_item_id: item.menu_item_id,      // Will be resolved to POS ID in concrete adapters
            name: item.menu_item_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            modifiers: item.modifiers.map((m) => ({
                pos_modifier_id: m.modifier_option_id,
                name: m.modifier_option_name,
                price: m.price_delta,
            })),
        }));

        return {
            external_order_id: order.id,
            restaurant_id: order.restaurant_id,
            source: 'voice_ai',
            channel: 'voice',
            customer_name: (order as unknown as { customer_name?: string }).customer_name ?? null,
            customer_phone: order.customer_phone ?? undefined,
            items: posItems,
            total_amount: order.total_amount,
            special_instructions: order.special_instructions ?? undefined,
            upsell_accepted_ids: (order as unknown as { upsell_accepted_ids?: string[] }).upsell_accepted_ids ?? [],
        };
    }

    protected logSubmission(orderId: string): void {
        log.info(`Submitting order to POS (${this.name})`, { orderId });
    }
}
