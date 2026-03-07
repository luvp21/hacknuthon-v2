/**
 * KOT Routes — Kitchen Order Ticket Display
 * Unauthenticated (kitchen display screen); no API key required.
 *
 * GET  /api/kot               → list active + recently completed orders
 * PATCH /api/kot/:id/start    → confirmed → in_kitchen
 * PATCH /api/kot/:id/complete → in_kitchen → completed
 *
 * Uses the live DB schema:
 *   orders(order_id INT, status VARCHAR, customer_phone, net_total, order_total,
 *          completed_at TIMESTAMP, updated_at TIMESTAMPTZ)
 *   order_lines(id INT, order_id INT, item_id INT, qty, line_total)
 *   menu_items(item_id INT, name VARCHAR)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { queryMany, query } from '../../database/postgres';
import { createServiceLogger } from '../../utils/logger';

const log = createServiceLogger('KOTRoutes');

interface KOTOrder {
    id: string;                 // order_id cast to text (used by front-end)
    status: string;
    customer_phone: string | null;
    total_amount: number;       // net_total
    subtotal: number;           // order_total (before discount)
    created_at: string;         // when the order was placed
    updated_at: string;
    items: Array<{
        menu_item_name: string;
        quantity: number;
        total_price: number;
        notes: string | null;
    }>;
}

export async function kotRoutes(app: FastifyInstance): Promise<void> {

    // ── GET /api/kot ──────────────────────────────────────────────────────────
    // Returns confirmed / in_kitchen / completed (last 2 h) orders with items
    app.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
        try {
            const rows = await queryMany<KOTOrder>(
                `SELECT
                   o.order_id::text                          AS id,
                   o.status,
                   o.customer_phone,
                   o.net_total                              AS total_amount,
                   o.order_total                            AS subtotal,
                   COALESCE(o.completed_at, o.updated_at)  AS created_at,
                   o.updated_at,
                   COALESCE(
                     json_agg(
                       json_build_object(
                         'menu_item_name', COALESCE(m.name, 'Item #' || ol.item_id::text),
                         'quantity',       ol.qty,
                         'total_price',    ol.line_total,
                         'notes',          ol.order_note
                       )
                       ORDER BY ol.id
                     ) FILTER (WHERE ol.id IS NOT NULL),
                     '[]'::json
                   ) AS items
                 FROM public.orders o
                 LEFT JOIN public.order_lines ol ON ol.order_id = o.order_id
                 LEFT JOIN public.menu_items  m  ON m.item_id  = ol.item_id
                 WHERE o.status IN ('confirmed', 'in_kitchen', 'completed')
                   AND (o.status != 'completed'
                        OR o.updated_at > NOW() - INTERVAL '2 hours')
                 GROUP BY o.order_id
                 ORDER BY COALESCE(o.completed_at, o.updated_at) ASC`,
                []
            );
            reply.send({ orders: rows });
        } catch (err) {
            log.error('KOT list failed', { error: (err as Error).message });
            reply.status(500).send({ error: 'Failed to fetch orders' });
        }
    });

    // ── PATCH /api/kot/:id/start ──────────────────────────────────────────────
    // confirmed → in_kitchen
    app.patch('/:id/start', async (
        req: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
    ) => {
        const orderId = parseInt(req.params.id, 10);
        try {
            await query(
                `UPDATE public.orders
                 SET status = 'in_kitchen', updated_at = NOW()
                 WHERE order_id = $1 AND status = 'confirmed'`,
                [orderId]
            );
            log.info('KOT order started', { orderId });
            reply.send({ success: true, status: 'in_kitchen' });
        } catch (err) {
            log.error('KOT start failed', { orderId, error: (err as Error).message });
            reply.status(500).send({ error: 'Failed to update order' });
        }
    });

    // ── PATCH /api/kot/:id/complete ───────────────────────────────────────────
    // in_kitchen → completed
    app.patch('/:id/complete', async (
        req: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
    ) => {
        const orderId = parseInt(req.params.id, 10);
        try {
            await query(
                `UPDATE public.orders
                 SET status = 'completed', completed_at = NOW(), updated_at = NOW()
                 WHERE order_id = $1 AND status = 'in_kitchen'`,
                [orderId]
            );
            log.info('KOT order completed', { orderId });
            reply.send({ success: true, status: 'completed' });
        } catch (err) {
            log.error('KOT complete failed', { orderId, error: (err as Error).message });
            reply.status(500).send({ error: 'Failed to update order' });
        }
    });
}
