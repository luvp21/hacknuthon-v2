/**
 * Order Controller
 * REST API for order management (list, get, cancel, status updates).
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { OrderService } from '../../orders/orderService';
import { createServiceLogger } from '../../utils/logger';
import { toAppError } from '../../utils/errors';
import { apiResponse, apiError } from '../../utils/helpers';
import { OrderStatus } from '../../types';

const log = createServiceLogger('OrderController');
const orderService = new OrderService();

/**
 * GET /api/orders?restaurantId=&status=&page=&limit=
 */
export async function listOrders(
    request: FastifyRequest<{
        Querystring: {
            restaurantId: string;
            status?: OrderStatus;
            page?: number;
            limit?: number;
        };
    }>,
    reply: FastifyReply
): Promise<void> {
    const { restaurantId, status, page = 1, limit = 20 } = request.query;

    try {
        const result = await orderService.listOrders({
            restaurantId,
            status,
            page: Number(page),
            limit: Number(limit),
        });

        reply.send({
            ...apiResponse(result.orders),
            total: result.total,
            page: Number(page),
            limit: Number(limit),
        });
    } catch (err) {
        const error = toAppError(err);
        log.error('List orders failed', { error: error.message });
        reply.status(error.statusCode).send(apiError(error.code, error.message));
    }
}

/**
 * GET /api/orders/:orderId
 */
export async function getOrder(
    request: FastifyRequest<{ Params: { orderId: string } }>,
    reply: FastifyReply
): Promise<void> {
    const { orderId } = request.params;

    try {
        const order = await orderService.getOrder(orderId);
        reply.send(apiResponse(order));
    } catch (err) {
        const error = toAppError(err);
        reply.status(error.statusCode).send(apiError(error.code, error.message));
    }
}

/**
 * PATCH /api/orders/:orderId/cancel
 */
export async function cancelOrder(
    request: FastifyRequest<{ Params: { orderId: string } }>,
    reply: FastifyReply
): Promise<void> {
    const { orderId } = request.params;

    try {
        await orderService.cancelOrder(orderId);
        reply.send(apiResponse({ orderId }, 'Order cancelled'));
    } catch (err) {
        const error = toAppError(err);
        reply.status(error.statusCode).send(apiError(error.code, error.message));
    }
}

/**
 * PATCH /api/orders/:orderId/status
 */
export async function updateOrderStatus(
    request: FastifyRequest<{
        Params: { orderId: string };
        Body: { status: OrderStatus; pos_order_id?: string; kot_number?: string };
    }>,
    reply: FastifyReply
): Promise<void> {
    const { orderId } = request.params;
    const { status, pos_order_id, kot_number } = request.body;

    try {
        await orderService.updateOrderStatus(orderId, status, {
            posOrderId: pos_order_id,
            kotNumber: kot_number,
        });
        reply.send(apiResponse({ orderId, status }, 'Status updated'));
    } catch (err) {
        const error = toAppError(err);
        reply.status(error.statusCode).send(apiError(error.code, error.message));
    }
}
