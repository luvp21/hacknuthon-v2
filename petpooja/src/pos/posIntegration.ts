/**
 * POS Integration Service
 * Manages POS adapter selection and provides a unified submission interface.
 * Supports: Generic REST, Petpooja, UrbanPiper (extendable).
 */

import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { createServiceLogger } from '../utils/logger';
import { POSError, ErrorCode } from '../utils/errors';
import {
    Order,
    POSOrderPayload,
    POSResponse,
    POSLineItem,
} from '../types';
import { BasePOSAdapter, IPOSAdapter } from './posAdapter';
import { sleep } from '../utils/helpers';

const log = createServiceLogger('POSIntegration');

// ─────────────────────────────────────────────────────────────────────────────
//  Generic REST POS Adapter
//  Works with any REST-based POS that accepts JSON orders.
//  Endpoint: POST /orders
// ─────────────────────────────────────────────────────────────────────────────
class GenericPOSAdapter extends BasePOSAdapter {
    readonly name = 'GenericREST';
    private http: AxiosInstance;

    constructor() {
        super();
        this.http = axios.create({
            baseURL: env.POS_API_BASE_URL,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': env.POS_API_KEY,
                'X-Restaurant-ID': env.POS_RESTAURANT_ID,
            },
            timeout: 10_000,
        });
    }

    async submitOrder(payload: POSOrderPayload): Promise<POSResponse> {
        this.logSubmission(payload.external_order_id);

        try {
            const response = await this.http.post<{
                success: boolean;
                order_id?: string;
                kot_number?: string;
                estimated_time?: number;
                error?: string;
            }>('/api/v1/orders', {
                external_id: payload.external_order_id,
                source: payload.source,
                restaurant_id: payload.restaurant_id,
                items: payload.items.map((item: POSLineItem) => ({
                    item_id: item.pos_item_id,
                    name: item.name,
                    qty: item.quantity,
                    price: item.unit_price,
                    modifiers: item.modifiers,
                })),
                total: payload.total_amount,
                special_notes: payload.special_instructions,
                customer_phone: payload.customer_phone,
                metadata: { channel: 'voice_ai', timestamp: new Date().toISOString() },
            });

            const { data } = response;

            if (!data.success) {
                return {
                    success: false,
                    error_code: 'POS_REJECTED',
                    error_message: data.error ?? 'POS rejected the order',
                };
            }

            log.info('Order accepted by POS', {
                posOrderId: data.order_id,
                kot: data.kot_number,
            });

            return {
                success: true,
                pos_order_id: data.order_id,
                kot_number: data.kot_number,
                estimated_time_minutes: data.estimated_time,
            };
        } catch (err) {
            if (axios.isAxiosError(err)) {
                const axiosErr = err as import('axios').AxiosError<{ message?: string }>;
                const status = axiosErr.response?.status ?? 0;
                const message = axiosErr.response?.data?.message ?? axiosErr.message;

                if (status === 401 || status === 403) {
                    throw new POSError('POS API authentication failed', ErrorCode.POS_AUTH_FAILED);
                }

                log.error('POS API error', { status, message });
                return {
                    success: false,
                    error_code: `HTTP_${status}`,
                    error_message: message,
                };
            }

            throw new POSError(
                `POS submission failed: ${(err as Error).message}`,
                ErrorCode.POS_UNAVAILABLE
            );
        }
    }

    async checkHealth(): Promise<boolean> {
        try {
            await this.http.get('/api/v1/health', { timeout: 3000 });
            return true;
        } catch {
            return false;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Petpooja POS Adapter (India-specific POS system)
//  API docs: https://www.petpooja.com/api-docs
// ─────────────────────────────────────────────────────────────────────────────
class PetpoojaAdapter extends BasePOSAdapter {
    readonly name = 'Petpooja';
    private http: AxiosInstance;

    constructor() {
        super();
        this.http = axios.create({
            baseURL: env.POS_API_BASE_URL,
            headers: {
                'Content-Type': 'application/json',
                token: env.POS_API_KEY,
            },
            timeout: 10_000,
        });
    }

    async submitOrder(payload: POSOrderPayload): Promise<POSResponse> {
        this.logSubmission(payload.external_order_id);

        try {
            const petpoojaPayload = {
                restID: env.POS_RESTAURANT_ID,
                accessToken: env.POS_API_KEY,
                orderData: {
                    orderId: payload.external_order_id,
                    orderType: 'delivery',
                    orderSource: 'voice_ai',
                    orderStatus: 'placed',
                    orderPaymentStatus: 'paid',
                    orderItems: payload.items.map((item) => ({
                        itemId: item.pos_item_id,
                        itemName: item.name,
                        itemQty: item.quantity,
                        itemPrice: item.unit_price,
                        itemTax: [],
                        itemVariantId: '',
                        addons: item.modifiers.map((mod) => ({
                            addonGroupId: '',
                            addonItemId: mod.pos_modifier_id,
                            addonName: mod.name,
                            addonPrice: mod.price,
                        })),
                    })),
                    totalItemsPrice: payload.total_amount,
                    totalOrderPrice: payload.total_amount,
                    specialInstructions: payload.special_instructions ?? '',
                    deliveryAddress: { phone: payload.customer_phone ?? '' },
                },
            };

            const response = await this.http.post<{
                status: string;
                message: string;
                data?: { orderId: string; kotNumber: string };
            }>('/api/v1/order/place', petpoojaPayload);

            if (response.data.status !== 'success') {
                return {
                    success: false,
                    error_code: 'PETPOOJA_REJECTED',
                    error_message: response.data.message,
                };
            }

            return {
                success: true,
                pos_order_id: response.data.data?.orderId,
                kot_number: response.data.data?.kotNumber,
            };
        } catch (err) {
            throw new POSError(
                `Petpooja submission failed: ${(err as Error).message}`,
                ErrorCode.POS_UNAVAILABLE
            );
        }
    }

    async checkHealth(): Promise<boolean> {
        try {
            await this.http.get('/api/v1/ping', { timeout: 3000 });
            return true;
        } catch {
            return false;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  POS Integration Service (Factory + Retry wrapper)
// ─────────────────────────────────────────────────────────────────────────────
export class POSIntegrationService {
    private adapter: IPOSAdapter;

    constructor() {
        this.adapter = this.resolveAdapter();
        log.info(`POS adapter initialised: ${this.adapter.name}`);
    }

    /**
     * Submit an order to the POS with automatic retry on transient failures.
     */
    async submitOrder(order: Order): Promise<POSResponse> {
        const payload = (this.adapter as BasePOSAdapter)['orderToPayload']
            ? (this.adapter as BasePOSAdapter)['orderToPayload'](order)
            : this.buildGenericPayload(order);

        let lastError: Error | null = null;
        const maxAttempts = env.POS_RETRY_ATTEMPTS;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await this.adapter.submitOrder(payload);

                if (result.success) {
                    log.info('POS submission successful', {
                        attempt,
                        posOrderId: result.pos_order_id,
                        kot: result.kot_number,
                    });
                    return result;
                }

                // POS explicitly rejected the order — don't retry
                if (
                    result.error_code === 'POS_REJECTED' ||
                    result.error_code === 'PETPOOJA_REJECTED'
                ) {
                    log.warn('POS rejected order', { error: result.error_message });
                    return result;
                }

                // Transient error — retry
                log.warn(`POS attempt ${attempt}/${maxAttempts} failed`, {
                    error: result.error_message,
                });
            } catch (err) {
                lastError = err as Error;
                log.error(`POS attempt ${attempt}/${maxAttempts} threw`, {
                    error: (err as Error).message,
                });
            }

            if (attempt < maxAttempts) {
                const delay = env.POS_RETRY_DELAY_MS * attempt;
                log.info(`Retrying POS in ${delay}ms`);
                await sleep(delay);
            }
        }

        throw new POSError(
            `POS submission failed after ${maxAttempts} attempts: ${lastError?.message}`,
            ErrorCode.POS_UNAVAILABLE
        );
    }

    /**
     * Check POS system health.
     */
    async checkHealth(): Promise<boolean> {
        return this.adapter.checkHealth();
    }

    // ── Private ──────────────────────────────────────────────────────────────
    private resolveAdapter(): IPOSAdapter {
        switch (env.POS_PROVIDER) {
            case 'petpooja':
                return new PetpoojaAdapter();
            case 'generic':
            default:
                return new GenericPOSAdapter();
        }
    }

    private buildGenericPayload(order: Order): POSOrderPayload {
        return {
            external_order_id: order.id,
            restaurant_id: order.restaurant_id,
            source: 'voice_ai',
            channel: 'voice',
            customer_name: (order as unknown as { customer_name?: string }).customer_name ?? null,
            customer_phone: order.customer_phone ?? undefined,
            items: order.items.map((item) => ({
                pos_item_id: item.menu_item_id,
                name: item.menu_item_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                modifiers: item.modifiers.map((m) => ({
                    pos_modifier_id: m.modifier_option_id,
                    name: m.modifier_option_name,
                    price: m.price_delta,
                })),
            })),
            total_amount: order.total_amount,
            special_instructions: order.special_instructions ?? undefined,
            upsell_accepted_ids: (order as unknown as { upsell_accepted_ids?: string[] }).upsell_accepted_ids ?? [],
        };
    }
}
