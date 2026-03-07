/**
 * Demo Controller
 * Thin request/response layer for the chat demo API.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { DemoConversationService } from '../demo/demoService';
import { MenuService } from '../../menu/menuService';
import { SupportedLanguage } from '../../types';
import { createServiceLogger } from '../../utils/logger';
import { env } from '../../config/env';

const log = createServiceLogger('DemoController');

// Single shared service instance (sessions stored in-memory per process)
const demoService = new DemoConversationService();
const menuService = new MenuService();

// ── Start session ─────────────────────────────────────────────────────────────

interface StartBody {
    restaurantId?: string;
    language?: SupportedLanguage;
    phone?: string;
}

export async function startDemo(
    request: FastifyRequest<{ Body: StartBody }>,
    reply: FastifyReply
): Promise<void> {
    const {
        restaurantId = env.DEFAULT_RESTAURANT_ID,
        language = 'en',
        phone = '+911234567890',
    } = request.body ?? {};

    const result = await demoService.startSession(restaurantId, language as SupportedLanguage, phone);

    reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
    });
}

// ── Chat ──────────────────────────────────────────────────────────────────────

interface ChatBody {
    sessionId: string;
    message: string;
}

export async function chatDemo(
    request: FastifyRequest<{ Body: ChatBody }>,
    reply: FastifyReply
): Promise<void> {
    const { sessionId, message } = request.body;

    if (!message?.trim()) {
        reply.status(400).send({
            success: false,
            error: 'INVALID_INPUT',
            message: 'message cannot be empty',
            timestamp: new Date().toISOString(),
        });
        return;
    }

    try {
        const result = await demoService.chat(sessionId, message.trim());
        reply.send({
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        const msg = (err as Error).message;
        log.error('Demo chat error', { sessionId, error: msg });

        if (msg.includes('not found')) {
            reply.status(404).send({
                success: false,
                error: 'SESSION_NOT_FOUND',
                message: 'Session not found. Please start a new session.',
                timestamp: new Date().toISOString(),
            });
        } else {
            reply.status(500).send({
                success: false,
                error: 'INTERNAL_ERROR',
                message: 'Something went wrong. Please try again.',
                timestamp: new Date().toISOString(),
            });
        }
    }
}

// ── Get session state ─────────────────────────────────────────────────────────

interface SessionParams {
    sessionId: string;
}

export async function getSessionDemo(
    request: FastifyRequest<{ Params: SessionParams }>,
    reply: FastifyReply
): Promise<void> {
    const session = await demoService.getSession(request.params.sessionId);
    if (!session) {
        reply.status(404).send({
            success: false,
            error: 'SESSION_NOT_FOUND',
            message: 'Session not found',
            timestamp: new Date().toISOString(),
        });
        return;
    }

    reply.send({
        success: true,
        data: {
            id: session.sessionId,
            state: session.state,
            language: session.language,
            cart: session.cart,
            cartTotal: session.cartTotal,
            turnCount: session.turnCount,
            contextSummary: session.contextSummary ?? null,
        },
        timestamp: new Date().toISOString(),
    });
}

// ── Create session (explicit) ─────────────────────────────────────────────────

interface CreateSessionBody {
    restaurantId?: string;
    language?: SupportedLanguage;
    phone?: string;
}

export async function createSessionDemo(
    request: FastifyRequest<{ Body: CreateSessionBody }>,
    reply: FastifyReply
): Promise<void> {
    const {
        restaurantId = env.DEFAULT_RESTAURANT_ID,
        language = 'en',
        phone = '+911234567890',
    } = request.body ?? {};

    const result = await demoService.startSession(restaurantId, language as SupportedLanguage, phone);
    reply.status(201).send({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
    });
}

// ── End session ───────────────────────────────────────────────────────────────

export async function deleteSessionDemo(
    request: FastifyRequest<{ Params: SessionParams }>,
    reply: FastifyReply
): Promise<void> {
    try {
        await demoService.endSession(request.params.sessionId);
        reply.status(204).send();
    } catch (err) {
        log.warn('deleteSession error', { error: (err as Error).message });
        reply.status(404).send({
            success: false,
            error: 'SESSION_NOT_FOUND',
            message: 'Session not found',
            timestamp: new Date().toISOString(),
        });
    }
}

// ── Menu (for sidebar display) ────────────────────────────────────────────────

interface MenuQuery {
    restaurantId?: string;
}

export async function getMenuDemo(
    request: FastifyRequest<{ Querystring: MenuQuery }>,
    reply: FastifyReply
): Promise<void> {
    const restaurantId = request.query.restaurantId ?? env.DEFAULT_RESTAURANT_ID;
    const items = await menuService.getAvailableItems(restaurantId);
    reply.send({
        success: true,
        data: items,
        timestamp: new Date().toISOString(),
    });
}
