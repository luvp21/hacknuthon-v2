/**
 * Webhook Routes — Twilio Voice Callbacks
 * All webhook endpoints use form-body parsing (Twilio sends x-www-form-urlencoded).
 * No authentication middleware — Twilio signature validation is applied instead.
 */

import { FastifyInstance } from 'fastify';
import {
    handleIncomingCall,
    handleGather,
    handleRecording,
    handleCallStatus,
} from '../controllers/webhook.controller';
import { CallHandler } from '../../voice/callHandler';
import { createServiceLogger } from '../../utils/logger';

const log = createServiceLogger('WebhookRoutes');

export async function webhookRoutes(app: FastifyInstance): Promise<void> {

    // ── Twilio signature validation hook ─────────────────────────────────────
    app.addHook('preHandler', async (request, reply) => {
        // Only validate in production to ease local development
        if (process.env.NODE_ENV !== 'production') return;

        const signature = request.headers['x-twilio-signature'] as string;
        const url = `${process.env.API_BASE_URL}${request.url}`;
        const params = request.body as Record<string, string>;

        if (!CallHandler.validateTwilioSignature(signature, url, params)) {
            log.warn('Invalid Twilio signature', { url });
            reply.status(403).send({ error: 'Invalid Twilio signature' });
            return;
        }
    });

    /**
     * POST /webhook/voice
     * Initial call webhook — returns greeting TwiML.
     */
    app.post('/voice', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    CallSid: { type: 'string' },
                    From: { type: 'string' },
                    To: { type: 'string' },
                    AccountSid: { type: 'string' },
                    CallStatus: { type: 'string' },
                },
                required: ['CallSid', 'From', 'To', 'AccountSid'],
            },
        },
    }, handleIncomingCall);

    /**
     * POST /webhook/gather
     * Twilio <Gather> callback — customer speech result.
     */
    app.post('/gather', handleGather);

    /**
     * POST /webhook/recording
     * Twilio recording complete callback (high-quality STT path).
     */
    app.post('/recording', handleRecording);

    /**
     * POST /webhook/status
     * Twilio call status update callback.
     */
    app.post('/status', handleCallStatus);

    log.info('Webhook routes registered');
}
