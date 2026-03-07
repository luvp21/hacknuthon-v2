/**
 * Order Service
 * CRUD operations for orders and integration with the POS submission queue.
 */

import { v4 as uuidv4 } from 'uuid';
import { Order, OrderItem, OrderStatus, SupportedLanguage } from '../types';
import { query, queryOne, queryMany, withTransaction } from '../database/postgres';
import { createServiceLogger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';
import { roundTo } from '../utils/helpers';

const log = createServiceLogger('OrderService');

interface CreateOrderParams {
    session_id: string;
    restaurant_id: string;
    items: OrderItem[];
    language: SupportedLanguage;
    customer_phone?: string;
    customer_name?: string;          // Extracted from conversation
    upsell_accepted_ids?: string[];  // Item IDs accepted via upsell
    special_instructions?: string;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
}

export class OrderService {
    /**
     * Create a new confirmed order in the database and enqueue for POS submission.
     */
    async createOrder(params: CreateOrderParams): Promise<Order> {
        const id = uuidv4();

        const order = await withTransaction(async (client) => {
            const result = await client.query<Order>(
                `INSERT INTO orders
          (id, session_id, restaurant_id, items, status,
           subtotal, tax_amount, total_amount,
           language, customer_phone, special_instructions,
           created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
         RETURNING *`,
                [
                    id,
                    params.session_id,
                    params.restaurant_id,
                    JSON.stringify(params.items),
                    'confirmed' as OrderStatus,
                    params.subtotal,
                    params.tax_amount,
                    params.total_amount,
                    params.language,
                    params.customer_phone ?? null,
                    params.special_instructions ?? null,
                ]
            );
            return result.rows[0];
        });

        log.info('Order created', {
            orderId: id,
            restaurant: params.restaurant_id,
            total: params.total_amount,
            itemCount: params.items.length,
        });

        // Submit to POS asynchronously (fire-and-forget — failures don't block the caller)
        this.submitToPOSAsync(order);

        return order;
    }

    /**
     * Retrieve an order by ID.
     */
    async getOrder(orderId: string): Promise<Order> {
        const row = await queryOne<Order>(
            'SELECT * FROM orders WHERE id = $1',
            [orderId]
        );
        if (!row) throw new NotFoundError('Order', orderId);
        return this.hydrateOrder(row);
    }

    /**
     * List orders for a restaurant with pagination.
     */
    async listOrders(params: {
        restaurantId: string;
        status?: OrderStatus;
        page?: number;
        limit?: number;
    }): Promise<{ orders: Order[]; total: number }> {
        const { restaurantId, status, page = 1, limit = 20 } = params;
        const offset = (page - 1) * limit;

        const conditions = ['restaurant_id = $1'];
        const queryParams: unknown[] = [restaurantId];

        if (status) {
            conditions.push(`status = $${queryParams.length + 1}`);
            queryParams.push(status);
        }

        const where = conditions.join(' AND ');

        const [rows, countResult] = await Promise.all([
            queryMany<Order>(
                `SELECT * FROM orders WHERE ${where}
         ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
                [...queryParams, limit, offset]
            ),
            query<{ count: string }>(
                `SELECT COUNT(*) FROM orders WHERE ${where}`,
                queryParams
            ),
        ]);

        return {
            orders: rows.map((r) => this.hydrateOrder(r)),
            total: parseInt(countResult.rows[0].count),
        };
    }

    /**
     * Update the status of an order.
     */
    async updateOrderStatus(
        orderId: string,
        status: OrderStatus,
        meta?: { posOrderId?: string; kotNumber?: string }
    ): Promise<void> {
        await query(
            `UPDATE orders SET
         status = $1,
         pos_order_id = COALESCE($2, pos_order_id),
         kot_number = COALESCE($3, kot_number),
         updated_at = NOW()
       WHERE id = $4`,
            [status, meta?.posOrderId ?? null, meta?.kotNumber ?? null, orderId]
        );

        log.info('Order status updated', { orderId, status });
    }

    /**
     * Cancel an order (only if not yet sent to POS).
     */
    async cancelOrder(orderId: string): Promise<void> {
        const order = await this.getOrder(orderId);

        if (['sent_to_pos', 'pos_accepted'].includes(order.status)) {
            throw new Error(`Cannot cancel order in status: ${order.status}`);
        }

        await this.updateOrderStatus(orderId, 'cancelled');
    }

    // ── Private helpers ─────────────────────────────────────────────────────────
    private submitToPOSAsync(order: Order): void {
        // Lazy-import to avoid circular deps; runs in background
        import('../pos/posIntegration').then(({ POSIntegrationService }) => {
            const pos = new POSIntegrationService();
            return pos.submitOrder(order);
        }).then(() => {
            this.updateOrderStatus(order.id, 'pos_accepted').catch(() => { /* ignore */ });
            log.info('Order accepted by POS', { orderId: order.id });
        }).catch((err: Error) => {
            log.error('POS submission failed (non-blocking)', {
                orderId: order.id,
                error: err.message,
            });
        });
    }

    private hydrateOrder(row: Order): Order {
        return {
            ...row,
            items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at),
        };
    }
}
