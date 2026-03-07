/**
 * Menu Routes
 * Protected management API for menu item CRUD and availability toggling.
 */

import { FastifyInstance } from 'fastify';
import { requireApiKey } from '../middleware/auth.middleware';
import {
    listMenuItems,
    getMenuItem,
    createMenuItem,
    updateMenuItem,
    setAvailability,
} from '../controllers/menu.controller';

export async function menuRoutes(app: FastifyInstance): Promise<void> {
    // All menu routes require API key
    app.addHook('preHandler', requireApiKey);

    /**
     * GET /api/menu
     */
    app.get('/', {
        schema: {
            querystring: {
                type: 'object',
                required: ['restaurantId'],
                properties: {
                    restaurantId: { type: 'string' },
                    available_only: { type: 'boolean', default: false },
                    category: { type: 'string' },
                },
            },
        },
    }, listMenuItems);

    /**
     * GET /api/menu/:itemId
     */
    app.get('/:itemId', {
        schema: {
            params: {
                type: 'object',
                properties: { itemId: { type: 'string', format: 'uuid' } },
                required: ['itemId'],
            },
        },
    }, getMenuItem);

    /**
     * POST /api/menu
     */
    app.post('/', createMenuItem);

    /**
     * PATCH /api/menu/:itemId
     */
    app.patch('/:itemId', updateMenuItem);

    /**
     * PATCH /api/menu/:itemId/availability
     */
    app.patch('/:itemId/availability', {
        schema: {
            body: {
                type: 'object',
                required: ['available'],
                properties: {
                    available: { type: 'boolean' },
                },
            },
        },
    }, setAvailability);
}
