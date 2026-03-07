/**
 * Auth Middleware
 * Validates the X-API-Key header for internal API routes.
 * Twilio webhook routes use signature validation instead.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../config/env';
import { createServiceLogger } from '../../utils/logger';

const log = createServiceLogger('AuthMiddleware');

/**
 * API key authentication for management endpoints.
 * Attach as a preHandler on route registration.
 */
export async function requireApiKey(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const apiKey =
        request.headers['x-api-key'] ??
        request.headers.authorization?.replace('Bearer ', '');

    if (!apiKey || apiKey !== env.API_SECRET_KEY) {
        log.warn('Unauthorised API access', {
            ip: request.ip,
            url: request.url,
            userAgent: request.headers['user-agent'],
        });

        reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Invalid or missing API key',
            timestamp: new Date().toISOString(),
        });
        return;
    }
}
