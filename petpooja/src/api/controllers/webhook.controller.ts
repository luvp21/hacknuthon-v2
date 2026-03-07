/**
 * Webhook Controller
 * Handles all Twilio webhook callbacks.
 * Routes: POST /webhook/voice, /webhook/gather, /webhook/recording, /webhook/status
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { CallHandler } from '../../voice/callHandler';
import { createServiceLogger } from '../../utils/logger';
import { toAppError } from '../../utils/errors';
import {
    TwilioWebhookInput,
    TwilioGatherInput,
    TwilioRecordingInput,
} from '../../utils/validators';

const log = createServiceLogger('WebhookController');

const callHandler = new CallHandler();

/**
 * POST /webhook/voice
 * Initial incoming call webhook from Twilio.
 */
export async function handleIncomingCall(
    request: FastifyRequest<{ Body: TwilioWebhookInput }>,
    reply: FastifyReply
): Promise<void> {
    const { CallSid, From, To } = request.body;

    log.info('Twilio incoming call', { callSid: CallSid });

    try {
        const twiml = await callHandler.handleIncomingCall({
            callSid: CallSid,
            from: From,
            to: To,
        });

        reply
            .status(200)
            .header('Content-Type', 'text/xml')
            .send(twiml);
    } catch (err) {
        const error = toAppError(err);
        log.error('Incoming call handler failed', { error: error.message });

        // Always return valid TwiML even on error
        reply
            .status(200)
            .header('Content-Type', 'text/xml')
            .send(
                '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we are experiencing technical difficulties. Please try again later.</Say><Hangup/></Response>'
            );
    }
}

/**
 * POST /webhook/gather
 * Called by Twilio after <Gather> captures customer speech.
 */
export async function handleGather(
    request: FastifyRequest<{ Body: TwilioGatherInput }>,
    reply: FastifyReply
): Promise<void> {
    const {
        CallSid,
        SpeechResult = '',
        Confidence = '0',
        From,
    } = request.body;

    log.info('Twilio gather callback', {
        callSid: CallSid,
        speechLen: SpeechResult.length,
        confidence: Confidence,
    });

    try {
        const twiml = await callHandler.handleGatherCallback({
            callSid: CallSid,
            speechResult: SpeechResult,
            confidence: Confidence,
            from: From,
        });

        reply.status(200).header('Content-Type', 'text/xml').send(twiml);
    } catch (err) {
        const error = toAppError(err);
        log.error('Gather callback failed', { callSid: CallSid, error: error.message });

        reply
            .status(200)
            .header('Content-Type', 'text/xml')
            .send(
                '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Something went wrong. Please call back.</Say><Hangup/></Response>'
            );
    }
}

/**
 * POST /webhook/recording
 * Called when a Twilio recording is complete (high-quality STT path).
 */
export async function handleRecording(
    request: FastifyRequest<{ Body: TwilioRecordingInput }>,
    reply: FastifyReply
): Promise<void> {
    const { CallSid, RecordingUrl, RecordingDuration = '0', From } = request.body;

    log.info('Recording callback', { callSid: CallSid, duration: RecordingDuration });

    try {
        const twiml = await callHandler.handleRecordingCallback({
            callSid: CallSid,
            recordingUrl: RecordingUrl,
            recordingDuration: RecordingDuration,
            from: From,
        });

        reply.status(200).header('Content-Type', 'text/xml').send(twiml);
    } catch (err) {
        const error = toAppError(err);
        log.error('Recording callback failed', { error: error.message });

        reply
            .status(200)
            .header('Content-Type', 'text/xml')
            .send(
                '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, there was an error.</Say><Hangup/></Response>'
            );
    }
}

/**
 * POST /webhook/status
 * Twilio call status callback (completed, no-answer, busy, failed).
 */
export async function handleCallStatus(
    request: FastifyRequest<{
        Body: { CallSid: string; CallStatus: string; CallDuration?: string };
    }>,
    reply: FastifyReply
): Promise<void> {
    const { CallSid, CallStatus, CallDuration } = request.body;

    log.info('Call status', { callSid: CallSid, status: CallStatus });

    try {
        await callHandler.handleCallStatus({
            callSid: CallSid,
            callStatus: CallStatus,
            callDuration: CallDuration,
        });
    } catch (err) {
        log.error('Call status handler failed', { error: (err as Error).message });
    }

    // Twilio ignores the body for status callbacks
    reply.status(204).send();
}
