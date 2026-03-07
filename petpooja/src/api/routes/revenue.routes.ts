/**
 * Revenue Routes
 * REST endpoints for the Revenue Intelligence Engine.
 * All routes are API-key protected.
 */

import { FastifyInstance } from 'fastify';
import { requireApiKey } from '../middleware/auth.middleware';
import {
    triggerRevenueCompute,
    getScores,
    getCombos,
} from '../controllers/revenue.controller';

export async function revenueRoutes(app: FastifyInstance): Promise<void> {
    app.addHook('preHandler', requireApiKey);

    /**
     * POST /api/revenue/compute/:restaurantId
     * Trigger a full revenue engine run.
     * Safe to call repeatedly — all writes are idempotent UPSERTs.
     */
    app.post('/compute/:restaurantId', {
        schema: {
            description: 'Run Revenue Intelligence Engine for a restaurant',
            tags: ['Revenue'],
            params: {
                type: 'object',
                required: ['restaurantId'],
                properties: { restaurantId: { type: 'string' } },
            },
        },
    }, triggerRevenueCompute);

    /**
     * GET /api/revenue/scores/:restaurantId
     * Fetch pre-computed BCG scores sorted by upsell_priority DESC.
     */
    app.get('/scores/:restaurantId', {
        schema: {
            description: 'Get revenue scores for all menu items',
            tags: ['Revenue'],
            params: {
                type: 'object',
                required: ['restaurantId'],
                properties: { restaurantId: { type: 'string' } },
            },
        },
    }, getScores);

    /**
     * GET /api/revenue/combos/:restaurantId
     * Fetch combo rules derived from co-occurrence analysis.
     */
    app.get('/combos/:restaurantId', {
        schema: {
            description: 'Get combo / cross-sell rules',
            tags: ['Revenue'],
            params: {
                type: 'object',
                required: ['restaurantId'],
                properties: { restaurantId: { type: 'string' } },
            },
        },
    }, getCombos);
}
