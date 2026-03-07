/**
 * Session Manager
 * Persists conversation session state in Redis for low-latency access.
 * Optionally syncs to PostgreSQL for analytics and audit trails.
 */

import { CallSession, SupportedLanguage } from '../types';
import { RedisKeys, redisSet, redisGet, redisDel } from '../database/redis';
import { query } from '../database/postgres';
import { env } from '../config/env';
import { createServiceLogger } from '../utils/logger';
import { generateId } from '../utils/helpers';
import { SessionNotFoundError } from '../utils/errors';

const log = createServiceLogger('SessionManager');

const SESSION_TTL = 1800; // 30 minutes

export class SessionManager {
    /**
     * Create a new call session and persist it to Redis + Postgres.
     */
    async createSession(params: {
        callSid: string;
        phoneNumber: string;
        restaurantId: string;
        language?: SupportedLanguage;
    }): Promise<CallSession> {
        const { callSid, phoneNumber, restaurantId, language = env.DEFAULT_LANGUAGE } = params;

        const session: CallSession = {
            id: generateId(),
            call_sid: callSid,
            phone_number: phoneNumber,
            restaurant_id: restaurantId,
            state: 'IDLE',
            language,
            conversation_history: [],
            partial_order: {},
            upsell_offered: false,
            upsell_accepted: false,
            upsell_shown: [],
            customer_name: null,
            retry_count: 0,
            created_at: new Date(),
            updated_at: new Date(),
        };

        // Persist to Redis (hot path)
        await redisSet(RedisKeys.session(callSid), session, SESSION_TTL);

        // Persist to Postgres (audit trail) — async, don't block response
        this.persistSessionToDb(session).catch((err) => {
            log.error('Failed to persist session to DB', {
                sessionId: session.id,
                error: (err as Error).message,
            });
        });

        log.info('Session created', { sessionId: session.id, callSid });
        return session;
    }

    /**
     * Retrieve a session from Redis. Returns null if not found.
     */
    async getSession(callSid: string): Promise<CallSession | null> {
        const session = await redisGet<CallSession>(RedisKeys.session(callSid));
        if (!session) {
            log.warn('Session not found in Redis', { callSid });
            return null;
        }

        // Rehydrate dates (JSON.parse loses Date objects)
        session.created_at = new Date(session.created_at);
        session.updated_at = new Date(session.updated_at);
        session.conversation_history = session.conversation_history.map((msg) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
        }));

        return session;
    }

    /**
     * Update session state and persist back to Redis.
     */
    async updateSession(session: CallSession): Promise<void> {
        session.updated_at = new Date();
        await redisSet(RedisKeys.session(session.call_sid), session, SESSION_TTL);
    }

    /**
     * Get or throw — shortcut for handlers that require a valid session.
     */
    async requireSession(callSid: string): Promise<CallSession> {
        const session = await this.getSession(callSid);
        if (!session) throw new SessionNotFoundError(callSid);
        return session;
    }

    /**
     * Mark session as complete and persist final state to Postgres.
     */
    async finaliseSession(
        callSid: string,
        meta?: {
            callDurationSeconds?: number;
            endedAt?: Date;
        }
    ): Promise<void> {
        const session = await this.getSession(callSid);
        if (!session) {
            log.warn('Cannot finalise — session not found', { callSid });
            return;
        }

        // Update DB record with final state
        await query(
            `UPDATE call_sessions
       SET state = $1,
           conversation_history = $2,
           partial_order = $3,
           upsell_offered = $4,
           upsell_accepted = $5,
           upsell_shown = $6,
           customer_name = $7,
           call_duration_s = $8,
           ended_at = $9,
           updated_at = NOW()
       WHERE call_sid = $10`,
            [
                session.state,
                JSON.stringify(session.conversation_history),
                session.partial_order ? JSON.stringify(session.partial_order) : null,
                session.upsell_offered,
                session.upsell_accepted,
                JSON.stringify(session.upsell_shown ?? []),
                session.customer_name ?? null,
                meta?.callDurationSeconds ?? null,
                meta?.endedAt ?? new Date(),
                callSid,
            ]
        );

        // Remove from Redis (session is over)
        await redisDel(RedisKeys.session(callSid));

        log.info('Session finalised', {
            callSid,
            state: session.state,
            duration: meta?.callDurationSeconds,
        });
    }

    /**
     * Append a message to the conversation history.
     */
    async addMessage(
        session: CallSession,
        role: 'user' | 'assistant',
        content: string
    ): Promise<void> {
        session.conversation_history.push({
            role,
            content,
            timestamp: new Date(),
        });

        // Keep history bounded to last 20 messages (avoid Redis bloat)
        if (session.conversation_history.length > 20) {
            session.conversation_history = session.conversation_history.slice(-20);
        }

        await this.updateSession(session);
    }

    // ── Private helpers ─────────────────────────────────────────────────────────
    private async persistSessionToDb(session: CallSession): Promise<void> {
        await query(
            `INSERT INTO call_sessions
        (id, call_sid, phone_number, restaurant_id, state, language,
         conversation_history, partial_order, upsell_offered, upsell_accepted,
         upsell_shown, customer_name, retry_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (call_sid) DO NOTHING`,
            [
                session.id,
                session.call_sid,
                session.phone_number,
                session.restaurant_id,
                session.state,
                session.language,
                JSON.stringify(session.conversation_history),
                session.partial_order ? JSON.stringify(session.partial_order) : null,
                session.upsell_offered,
                session.upsell_accepted,
                JSON.stringify(session.upsell_shown ?? []),
                session.customer_name ?? null,
                session.retry_count,
                session.created_at,
                session.updated_at,
            ]
        );
    }
}
