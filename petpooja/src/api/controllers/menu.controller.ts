/**
 * Menu Controller
 * REST API for menu item CRUD and availability management.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { MenuService } from '../../menu/menuService';
import { createServiceLogger } from '../../utils/logger';
import { toAppError } from '../../utils/errors';
import { apiResponse, apiError } from '../../utils/helpers';
import { CreateMenuItemInput, UpdateMenuItemInput } from '../../utils/validators';

const log = createServiceLogger('MenuController');
const menuService = new MenuService();

/**
 * GET /api/menu?restaurantId=
 */
export async function listMenuItems(
    request: FastifyRequest<{ Querystring: { restaurantId: string } }>,
    reply: FastifyReply
): Promise<void> {
    const { restaurantId } = request.query;

    try {
        const items = await menuService.getAvailableItems(restaurantId);
        reply.send(apiResponse(items));
    } catch (err) {
        const error = toAppError(err);
        reply.status(error.statusCode).send(apiError(error.code, error.message));
    }
}

/**
 * GET /api/menu/:itemId
 */
export async function getMenuItem(
    request: FastifyRequest<{ Params: { itemId: string } }>,
    reply: FastifyReply
): Promise<void> {
    const { itemId } = request.params;

    try {
        const item = await menuService.getMenuItem(itemId);
        reply.send(apiResponse(item));
    } catch (err) {
        const error = toAppError(err);
        reply.status(error.statusCode).send(apiError(error.code, error.message));
    }
}

/**
 * POST /api/menu
 */
export async function createMenuItem(
    request: FastifyRequest<{ Body: CreateMenuItemInput }>,
    reply: FastifyReply
): Promise<void> {
    // Inject restaurant_id from query since it's management-level
    const restaurantId = (request.query as { restaurantId?: string }).restaurantId ?? '';

    try {
        const item = await menuService.createMenuItem({
            ...request.body,
            restaurant_id: restaurantId,
        });
        reply.status(201).send(apiResponse(item, 'Menu item created'));
    } catch (err) {
        const error = toAppError(err);
        reply.status(error.statusCode).send(apiError(error.code, error.message));
    }
}

/**
 * PATCH /api/menu/:itemId
 */
export async function updateMenuItem(
    request: FastifyRequest<{
        Params: { itemId: string };
        Body: UpdateMenuItemInput;
    }>,
    reply: FastifyReply
): Promise<void> {
    const { itemId } = request.params;

    try {
        const item = await menuService.updateMenuItem(itemId, request.body as Parameters<typeof menuService.updateMenuItem>[1]);
        reply.send(apiResponse(item, 'Menu item updated'));
    } catch (err) {
        const error = toAppError(err);
        reply.status(error.statusCode).send(apiError(error.code, error.message));
    }
}

/**
 * PATCH /api/menu/:itemId/availability
 */
export async function setAvailability(
    request: FastifyRequest<{
        Params: { itemId: string };
        Body: { is_available: boolean };
    }>,
    reply: FastifyReply
): Promise<void> {
    const { itemId } = request.params;
    const { is_available } = request.body;

    try {
        await menuService.setAvailability(itemId, is_available);
        reply.send(apiResponse({ itemId, is_available }, 'Availability updated'));
    } catch (err) {
        const error = toAppError(err);
        reply.status(error.statusCode).send(apiError(error.code, error.message));
    }
}
