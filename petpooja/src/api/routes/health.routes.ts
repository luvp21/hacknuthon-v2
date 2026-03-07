/**
 * Health Routes
 * Public health-check endpoints for Docker HEALTHCHECK and monitoring.
 * No authentication required.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPostgresPool } from '../../database/postgres';
import { createServiceLogger } from '../../utils/logger';

const logger = createServiceLogger('health');

interface ComponentStatus {
    status: 'ok' | 'down';
    latency_ms?: number;
    error?: string;
}

async function checkPostgres(): Promise<ComponentStatus> {
    const start = Date.now();
    try {
        const pool = getPostgresPool();
        await pool.query('SELECT 1');
        return { status: 'ok', latency_ms: Date.now() - start };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'unknown';
        logger.warn('Postgres health check failed', { err: message });
        return { status: 'down', latency_ms: Date.now() - start, error: message };
    }
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
    /**
     * GET /health
     * Returns overall system health. Used by Docker HEALTHCHECK.
     */
    app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
        const postgres = await checkPostgres();
        const overall = postgres.status === 'ok' ? 'ok' : 'down';

        return reply.status(overall === 'ok' ? 200 : 503).send({
            status: overall,
            timestamp: new Date().toISOString(),
            uptime_seconds: Math.floor(process.uptime()),
            components: { postgres },
        });
    });

    /**
     * GET /health/ready — readiness probe.
     */
    app.get('/health/ready', async (_req: FastifyRequest, reply: FastifyReply) => {
        const postgres = await checkPostgres();
        const ready = postgres.status === 'ok';
        return reply.status(ready ? 200 : 503).send({ ready, postgres: postgres.status });
    });

    /**
     * GET /health/live — liveness probe (process is responsive).
     */
    app.get('/health/live', async (_req: FastifyRequest, reply: FastifyReply) => {
        return reply.send({ alive: true, uptime_seconds: Math.floor(process.uptime()) });
    });
}

