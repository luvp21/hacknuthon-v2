/**
 * Voice Integration Routes
 * Simplified endpoint for the Python voice agent.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DemoConversationService } from '../demo/demoService';
import { getLastTiming } from '../../brain/brainService';
import { getSession, getCacheStats } from '../../conversation/sessionStore';
import { env } from '../../config/env';
import { createServiceLogger } from '../../utils/logger';
import { logTurn, endSessionLog } from '../../utils/turnLogger';

const log = createServiceLogger('VoiceRoutes');
const demoService = new DemoConversationService();

interface ChatBody {
    message: string;
    sessionId?: string; // Provided by voice_agent (e.g., call_sid)
}

async function handleVoiceChat(
    request: FastifyRequest<{ Body: ChatBody }>,
    reply: FastifyReply
): Promise<void> {
    const { message, sessionId = 'voice-default-session' } = request.body;
    const startMs = Date.now();

    log.info('Voice chat request', { sessionId, message: message?.substring(0, 80) });

    if (!message?.trim()) {
        reply.status(400).send({
            success: false,
            error: 'INVALID_INPUT',
            message: 'message cannot be empty',
        });
        return;
    }

    try {
        // ── Brain / LLM processing (session is created inside brainService if missing) ──
        const t0Brain = Date.now();
        const result = await demoService.chat(sessionId, message.trim());
        const brainMs = Date.now() - t0Brain;
        const sessionDbMs = 0; // cache — no blocking DB call

        // Pick up per-turn RAG + LLM + intent timings stored by brainService
        const brainInternals = getLastTiming(sessionId);

        const totalMs = Date.now() - startMs;

        log.info('Voice chat complete', {
            sessionId,
            totalMs,
            sessionDbMs,
            brainMs,
            intentMs: brainInternals?.intent ?? null,
            ragMs: brainInternals?.rag ?? null,
            llmMs: brainInternals?.llm ?? null,
            reply: result.reply.substring(0, 80),
        });

        // ── Turn log (human-readable file, like voice_agent/logs) ─────────────
        logTurn(sessionId, {
            userText: message.trim(),
            botText: result.reply,
            intent: result.intent ?? 'UNKNOWN',
            intent_ms: brainInternals?.intent ?? null,
            rag_ms: brainInternals?.rag ?? null,
            llm_ms: brainInternals?.llm ?? null,
            brain_ms: brainMs,
            cart: result.cart.map(i => ({ name: i.name, qty: i.qty, lineTotal: i.lineTotal })),
            cartTotal: result.cartTotal,
            appliedDiscount: result.appliedDiscount,
            netTotal: result.netTotal,
        });

        // Write footer when the call is done
        if (result.isComplete) {
            endSessionLog(
                sessionId,
                result.cart.map(i => ({ name: i.name, qty: i.qty, lineTotal: i.lineTotal })),
                result.appliedDiscount,
                result.netTotal,
            );
        }

        // ── 3. Return reply + _timing breakdown for the Python voice agent ────
        reply.status(200).send({
            reply: result.reply,
            _timing: {
                total_ms: totalMs,
                session_db_ms: sessionDbMs,
                brain_ms: brainMs,
                intent_ms: brainInternals?.intent ?? null,
                rag_ms: brainInternals?.rag ?? null,
                llm_ms: brainInternals?.llm ?? null,
            },
        });

    } catch (err) {
        const elapsedMs = Date.now() - startMs;
        const errMsg = (err as Error).message ?? 'unknown error';
        log.error('Voice chat error', { sessionId, elapsedMs, error: errMsg });
        reply.status(200).send({
            reply: "I'm sorry, I'm having a little trouble right now. Could you please repeat that?",
            _timing: { total_ms: elapsedMs, error: errMsg },
        });
    }
}

async function handleDebugSession(
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
): Promise<void> {
    const { sessionId } = request.params;
    const session = await getSession(sessionId);
    if (!session) {
        reply.status(404).send({ error: 'not found', sessionId });
        return;
    }
    reply.send({
        sessionId: session.sessionId,
        state: session.state,
        language: session.language,
        turnCount: session.turnCount,
        cartItems: session.cart.length,
        cart: session.cart.map((i) => ({ name: i.name, qty: i.qty, lineTotal: i.lineTotal })),
        cartTotal: session.cartTotal,
        appliedDiscount: session.appliedDiscount,
        netTotal: session.netTotal,
        customerName: session.customer.customerName,
        awaitingConfirmation: session.awaitingOrderConfirmation,
        callEnded: session.callEnded,
        orderId: session.orderId ?? null,
    });
}

async function handleCacheStats(
    _request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    reply.send(getCacheStats());
}

export async function voiceRoutes(app: FastifyInstance): Promise<void> {
    app.post('/chat', handleVoiceChat);
    // Debug endpoints — live session state (cache-first, DB fallback)
    app.get('/debug/session/:sessionId', handleDebugSession);
    app.get('/debug/cache', handleCacheStats);
}

