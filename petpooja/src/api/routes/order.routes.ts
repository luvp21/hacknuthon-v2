/**
 * Order Routes
 * Protected management API for order querying and status management.
 */

import { FastifyInstance } from 'fastify';
import { requireApiKey } from '../middleware/auth.middleware';
import {
    listOrders,
    getOrder,
    cancelOrder,
    updateOrderStatus,
} from '../controllers/order.controller';

export async function orderRoutes(app: FastifyInstance): Promise<void> {
    // All order routes require API key
    app.addHook('preHandler', requireApiKey);

    /**
     * GET /api/orders
     * List orders with optional filtering.
     */
    app.get('/', {
        schema: {
            querystring: {
                type: 'object',
                required: ['restaurantId'],
                properties: {
                    restaurantId: { type: 'string' },
                    status: { type: 'string' },
                    page: { type: 'integer', default: 1 },
                    limit: { type: 'integer', default: 20 },
                },
            },
        },
    }, listOrders);

    /**
     * GET /api/orders/:orderId
     */
    app.get('/:orderId', {
        schema: {
            params: {
                type: 'object',
                properties: { orderId: { type: 'string', format: 'uuid' } },
                required: ['orderId'],
            },
        },
    }, getOrder);

    /**
     * PATCH /api/orders/:orderId/cancel
     */
    app.patch('/:orderId/cancel', cancelOrder);

    /**
     * PATCH /api/orders/:orderId/status
     */
    app.patch('/:orderId/status', {
        schema: {
            body: {
                type: 'object',
                required: ['status'],
                properties: {
                    status: { type: 'string' },
                    pos_order_id: { type: 'string' },
                    kot_number: { type: 'string' },
                },
            },
        },
    }, updateOrderStatus);
}
