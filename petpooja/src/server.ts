/**
 * Main Application Server
 * Fastify-based HTTP server bootstrapped with all plugins, routes,
 * and graceful shutdown handling.
 */

import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyFormbody from '@fastify/formbody';
import fastifyMultipart from '@fastify/multipart';
import path from 'path';
import fs from 'fs';

import { env } from './config/env';
import { logger } from './utils/logger';
import { registerRoutes } from './api/routes';
import { getPostgresPool, bootstrapTables } from './database/postgres';
import { MenuService } from './menu/menuService';
import { initRag } from './rag/ragService';

async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({
        logger: false,                // We use winston instead
        trustProxy: true,            // For X-Forwarded-* headers behind reverse proxy
        requestTimeout: 30_000,
        bodyLimit: 10 * 1024 * 1024, // 10MB (for audio uploads)
    });

    // ── Security headers ──────────────────────────────────────────────────────
    await app.register(fastifyHelmet, {
        contentSecurityPolicy: false, // Allow inline scripts in demo page
    });

    // ── Demo web page ─────────────────────────────────────────────────────────
    app.get('/demo', (_request, reply) => {
        const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
        if (!fs.existsSync(htmlPath)) {
            reply.status(404).send('Demo page not found');
            return;
        }
        reply.type('text/html').send(fs.readFileSync(htmlPath, 'utf8'));
    });

    // ── KOT kitchen display ───────────────────────────────────────────────────
    app.get('/kot', (_request, reply) => {
        const htmlPath = path.join(__dirname, '..', 'public', 'kot.html');
        if (!fs.existsSync(htmlPath)) {
            reply.status(404).send('KOT page not found');
            return;
        }
        reply.type('text/html').send(fs.readFileSync(htmlPath, 'utf8'));
    });

    // ── CORS ──────────────────────────────────────────────────────────────────
    await app.register(fastifyCors, {
        origin: env.NODE_ENV === 'production' ? env.API_BASE_URL : true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    });

    // ── Rate limiting ─────────────────────────────────────────────────────────
    await app.register(fastifyRateLimit, {
        global: true,
        max: env.RATE_LIMIT_MAX,
        timeWindow: env.RATE_LIMIT_WINDOW_MS,
        keyGenerator: (request) => request.ip,
        errorResponseBuilder: () => ({
            success: false,
            error: 'RATE_LIMITED',
            message: 'Too many requests. Please slow down.',
            timestamp: new Date().toISOString(),
        }),
    });

    // ── Body parsers ──────────────────────────────────────────────────────────
    // application/x-www-form-urlencoded (Twilio sends this)
    await app.register(fastifyFormbody);
    // multipart/form-data (audio file uploads)
    await app.register(fastifyMultipart, {
        limits: { fileSize: 10 * 1024 * 1024 },
    });

    // ── Request / Response logging ────────────────────────────────────────────
    app.addHook('onRequest', (request, _reply, done) => {
        logger.info('Incoming request', {
            method: request.method,
            url: request.url,
            ip: request.ip,
            requestId: request.id,
        });
        done();
    });

    app.addHook('onResponse', (request, reply, done) => {
        logger.info('Request completed', {
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            requestId: request.id,
        });
        done();
    });

    // ── Global error handler ──────────────────────────────────────────────────
    app.setErrorHandler((error, request, reply) => {
        const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
        const code = (error as { code?: string }).code ?? 'INTERNAL_ERROR';

        logger.error('Unhandled request error', {
            error: error.message,
            code,
            statusCode,
            url: request.url,
            stack: env.NODE_ENV !== 'production' ? error.stack : undefined,
        });

        reply.status(statusCode).send({
            success: false,
            error: code,
            message:
                env.NODE_ENV === 'production' && statusCode === 500
                    ? 'An internal server error occurred'
                    : error.message,
            timestamp: new Date().toISOString(),
        });
    });

    // ── 404 handler ───────────────────────────────────────────────────────────
    app.setNotFoundHandler((_request, reply) => {
        reply.status(404).send({
            success: false,
            error: 'NOT_FOUND',
            message: 'Route not found',
            timestamp: new Date().toISOString(),
        });
    });

    // ── Register all API routes ────────────────────────────────────────────────
    await registerRoutes(app);

    return app;
}

async function start(): Promise<void> {
    logger.info('Starting AI Voice Ordering Copilot…');

    // Validate database connectivity before accepting traffic
    const pg = getPostgresPool();

    try {
        await pg.query('SELECT 1');
        logger.info('PostgreSQL connection verified');
    } catch (err) {
        // Non-fatal: warn but continue. Neon serverless may wake up on first query.
        logger.warn('PostgreSQL connection check failed at startup — server will continue anyway.', { error: err });
        logger.warn('If the DB is truly unavailable, /chat calls will fail. Check DB_HOST / DB_PASSWORD in .env');
    }

    // Bootstrap session tables (CREATE TABLE IF NOT EXISTS — no migration needed)
    try {
        await bootstrapTables();
    } catch (err) {
        logger.warn('bootstrapTables failed — sessions may not work', { error: (err as Error).message });
    }

    // ── Pre-warm menu cache so first voice call is fast ───────────────────────
    try {
        const menuService = new MenuService();
        const items = await menuService.getAvailableItems(env.DEFAULT_RESTAURANT_ID);
        await menuService.getRestaurantName(env.DEFAULT_RESTAURANT_ID);
        logger.info(`Menu pre-warmed: ${items.length} items for restaurant ${env.DEFAULT_RESTAURANT_ID}`);
    } catch (err) {
        logger.warn('Menu pre-warm failed — will load on first request', { error: (err as Error).message });
    }

    // ── Load RAG vector store so first voice call has menu knowledge ──────────
    try {
        await initRag();
    } catch (err) {
        logger.warn('RAG init failed — bot will answer without menu context', { error: (err as Error).message });
    }

    const app = await buildApp();

    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`Server listening on http://localhost:${env.PORT}`);
    logger.info(`Demo app running at http://localhost:${env.PORT}/demo`);
    logger.info(`Environment: ${env.NODE_ENV}`);

    // ── Graceful shutdown ─────────────────────────────────────────────────────
    const shutdown = async (signal: string) => {
        logger.info(`${signal} received — shutting down gracefully`);

        await app.close();
        logger.info('HTTP server closed');

        await pg.end();
        logger.info('PostgreSQL pool closed');

        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (err) => {
        logger.error('Uncaught exception', { error: err.message, stack: err.stack });
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled promise rejection', { reason });
        process.exit(1);
    });
}

start();
