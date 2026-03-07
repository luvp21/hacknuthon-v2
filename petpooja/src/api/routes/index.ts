/**
 * Routes Index
 * Central registration point for all Fastify route plugins.
 * Imported by src/server.ts as:
 *   import { registerRoutes } from './api/routes';
 */

import { FastifyInstance } from 'fastify';
import { webhookRoutes } from './webhook.routes';
import { orderRoutes } from './order.routes';
import { menuRoutes } from './menu.routes';
import { healthRoutes } from './health.routes';
import { revenueRoutes } from './revenue.routes';
import { demoRoutes } from './demo.routes';
import { voiceRoutes } from './voice.routes';
import { kotRoutes } from './kot.routes';

/**
 * Register every route plugin with its URL prefix.
 *
 * URL map:
 *   /health          → health probes (public)
 *   /webhook/voice   → Twilio incoming call
 *   /webhook/gather  → Twilio speech callback
 *   /api/orders/**   → Order management (API-key protected)
 *   /api/menu/**     → Menu management  (API-key protected)
 *   /api/revenue/**  → Revenue Intelligence (API-key protected)
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
    // Health / probes — no prefix, no auth
    await app.register(healthRoutes);

    // Twilio webhooks — /webhook prefix
    await app.register(webhookRoutes, { prefix: '/webhook' });

    // Management REST APIs — /api prefix, per-router auth applied inside each plugin
    await app.register(orderRoutes, { prefix: '/api/orders' });
    await app.register(menuRoutes, { prefix: '/api/menu' });
    await app.register(revenueRoutes, { prefix: '/api/revenue' });

    // Demo chat (public — no API key required)
    await app.register(demoRoutes, { prefix: '/api/demo' });

    // Voice integration (direct /chat endpoint)
    await app.register(voiceRoutes);

    // KOT kitchen display (unauthenticated)
    await app.register(kotRoutes, { prefix: '/api/kot' });
}
