/**
 * Revenue Intelligence Controller
 * Exposes the Revenue Engine over REST so the Petpooja dashboard (or any
 * operator tool) can trigger a re-compute and fetch current BCG scores.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { computeRevenueScores, getRevenueScores } from '../../revenue/revenueEngine';
import { queryMany } from '../../database/postgres';
import { ComboRule, ApiResponse } from '../../types';
import { createServiceLogger } from '../../utils/logger';

const log = createServiceLogger('RevenueController');

// ── Param / query types ───────────────────────────────────────────────────────
interface RestaurantParams {
    restaurantId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/revenue/compute/:restaurantId
//  Triggers a full revenue engine run for one restaurant.
//  Safe to call repeatedly — all writes are UPSERT.
// ─────────────────────────────────────────────────────────────────────────────
export async function triggerRevenueCompute(
    request: FastifyRequest<{ Params: RestaurantParams }>,
    reply: FastifyReply
): Promise<void> {
    const { restaurantId } = request.params;

    log.info('Revenue compute triggered via API', { restaurantId });

    try {
        const scores = await computeRevenueScores(restaurantId);

        const summary = {
            total: scores.length,
            stars: scores.filter((s) => s.quadrant === 'Star').length,
            hidden_stars: scores.filter((s) => s.quadrant === 'Hidden Star').length,
            risk: scores.filter((s) => s.quadrant === 'Risk').length,
            dogs: scores.filter((s) => s.quadrant === 'Dog').length,
        };

        const response: ApiResponse<typeof summary> = {
            success: true,
            data: summary,
            message: `Revenue scores computed for ${scores.length} items`,
            timestamp: new Date().toISOString(),
        };

        reply.status(200).send(response);
    } catch (err) {
        log.error('Revenue compute failed', { restaurantId, error: (err as Error).message });
        reply.status(500).send({
            success: false,
            error: (err as Error).message,
            timestamp: new Date().toISOString(),
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/revenue/scores/:restaurantId
//  Returns current BCG scores sorted by upsell_priority DESC.
// ─────────────────────────────────────────────────────────────────────────────
export async function getScores(
    request: FastifyRequest<{ Params: RestaurantParams }>,
    reply: FastifyReply
): Promise<void> {
    const { restaurantId } = request.params;

    try {
        const scores = await getRevenueScores(restaurantId);

        const response: ApiResponse<typeof scores> = {
            success: true,
            data: scores,
            timestamp: new Date().toISOString(),
        };

        reply.status(200).send(response);
    } catch (err) {
        log.error('Failed to fetch revenue scores', { restaurantId, error: (err as Error).message });
        reply.status(500).send({
            success: false,
            error: (err as Error).message,
            timestamp: new Date().toISOString(),
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/revenue/combos/:restaurantId
//  Returns co-occurrence based combo rules, ordered by confidence DESC.
// ─────────────────────────────────────────────────────────────────────────────
export async function getCombos(
    request: FastifyRequest<{ Params: RestaurantParams }>,
    reply: FastifyReply
): Promise<void> {
    const { restaurantId } = request.params;

    try {
        const combos = await queryMany<ComboRule & { item_a_name: string; item_b_name: string }>(
            `SELECT c.*,
                    ma.name AS item_a_name,
                    mb.name AS item_b_name
             FROM combos c
             JOIN menu_items ma ON c.item_a = ma.id
             JOIN menu_items mb ON c.item_b = mb.id
             WHERE c.restaurant_id = $1
             ORDER BY c.confidence DESC
             LIMIT 50`,
            [restaurantId]
        );

        const response: ApiResponse<typeof combos> = {
            success: true,
            data: combos,
            timestamp: new Date().toISOString(),
        };

        reply.status(200).send(response);
    } catch (err) {
        log.error('Failed to fetch combos', { restaurantId, error: (err as Error).message });
        reply.status(500).send({
            success: false,
            error: (err as Error).message,
            timestamp: new Date().toISOString(),
        });
    }
}
