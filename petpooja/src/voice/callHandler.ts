/**
 * Call Handler
 * Orchestrates the full Twilio voice call lifecycle.
 * Processes incoming webhooks, recording callbacks, and gather results.
 */

import twilio from 'twilio';
import { env } from '../config/env';
import { createServiceLogger } from '../utils/logger';
import { buildVoicePrompt, buildHangupTwiML, buildGatherTwiML, buildTwiMLResponse, buildSayTwiML } from './ttsService';
import { transcribeAudio, isTranscriptReliable } from './speechProcessor';
import { ConversationManager } from '../conversation/conversationManager';
import { SessionManager } from '../conversation/sessionManager';
import { detectLanguage } from '../ai/languageDetector';
import { SupportedLanguage } from '../types';
import { maskPhone } from '../utils/helpers';

const log = createServiceLogger('CallHandler');

// ── TwiML paths ───────────────────────────────────────────────────────────────
const WEBHOOK_BASE = env.API_BASE_URL;
const GATHER_PATH = `${WEBHOOK_BASE}/webhook/gather`;
const RECORDING_PATH = `${WEBHOOK_BASE}/webhook/recording`;

export class CallHandler {
    private sessionManager: SessionManager;
    private conversationManager: ConversationManager;

    constructor() {
        this.sessionManager = new SessionManager();
        this.conversationManager = new ConversationManager();
    }

    /**
     * Validate that a request genuinely came from Twilio.
     */
    static validateTwilioSignature(
        signature: string,
        url: string,
        params: Record<string, string>
    ): boolean {
        if (env.NODE_ENV !== 'production') return true; // Skip in dev
        if (!env.TWILIO_WEBHOOK_SECRET) return true;

        return twilio.validateRequest(
            env.TWILIO_AUTH_TOKEN,
            signature,
            url,
            params
        );
    }

    /**
     * Handle the initial incoming call webhook from Twilio.
     * Creates a session and returns the greeting TwiML.
     */
    async handleIncomingCall(params: {
        callSid: string;
        from: string;
        to: string;
        restaurantId?: string;
    }): Promise<string> {
        const { callSid, from, restaurantId = env.DEFAULT_RESTAURANT_ID } = params;

        log.info('Incoming call', {
            callSid,
            from: maskPhone(from),
            restaurantId,
        });

        // Create a new conversation session
        const session = await this.sessionManager.createSession({
            callSid,
            phoneNumber: from,
            restaurantId,
        });

        // Get greeting from conversation manager
        const { twiml } = await this.conversationManager.handleGreeting(session);

        log.debug('Returning greeting TwiML', { callSid });
        return twiml;
    }

    /**
     * Handle the <Gather> callback — customer spoke and Twilio ASR captured it.
     * Uses Twilio's built-in speech recognition for low latency.
     */
    async handleGatherCallback(params: {
        callSid: string;
        speechResult: string;
        confidence: string;
        from: string;
    }): Promise<string> {
        const { callSid, speechResult, confidence: confStr } = params;
        const confidence = parseFloat(confStr || '0');

        log.info('Gather result', {
            callSid,
            speechLen: speechResult.length,
            confidence,
        });

        const session = await this.sessionManager.getSession(callSid);
        if (!session) {
            log.warn('Session not found for gather', { callSid });
            return buildHangupTwiML(
                'Sorry, your session has expired. Please call again.',
                'en'
            );
        }

        // Detect language from the transcribed text
        if (speechResult) {
            const detectedLang = detectLanguage(speechResult);
            if (detectedLang !== session.language) {
                session.language = detectedLang;
                log.info('Language updated', { callSid, language: detectedLang });
            }
        }

        // If STT confidence too low → ask to repeat
        if (!speechResult || speechResult.trim().length < 2 || confidence < 0.4) {
            session.retry_count++;
            await this.sessionManager.updateSession(session);

            if (session.retry_count >= 3) {
                return buildHangupTwiML(
                    'Sorry, I had trouble understanding you. Please call back and try again.',
                    session.language
                );
            }

            const retryMsg =
                session.language === 'en'
                    ? "Sorry, I couldn't hear you clearly. Could you please repeat that?"
                    : 'माफ़ करें, स्पष्ट नहीं सुना। क्या आप दोबारा बोल सकते हैं?';

            return buildVoicePrompt({
                promptText: retryMsg,
                actionPath: GATHER_PATH,
                language: session.language,
                speechTimeout: 5,
            });
        }

        // Reset retry count on successful capture
        session.retry_count = 0;

        // Process with conversation manager
        const { twiml } = await this.conversationManager.processUserInput(
            session,
            speechResult
        );

        return twiml;
    }

    /**
     * Handle Twilio recording complete callback.
     * Downloads audio, runs high-quality STT, then processes.
     * Used as a fallback / premium quality path.
     */
    async handleRecordingCallback(params: {
        callSid: string;
        recordingUrl: string;
        recordingDuration: string;
        from: string;
    }): Promise<string> {
        const { callSid, recordingUrl } = params;

        log.info('Recording callback received', {
            callSid,
            recordingUrl: recordingUrl.slice(0, 80),
        });

        const session = await this.sessionManager.getSession(callSid);
        if (!session) {
            return buildHangupTwiML('Session expired. Please call again.', 'en');
        }

        // Add .mp3 extension if not present for Twilio recording URLs
        const audioUrl = recordingUrl.endsWith('.mp3')
            ? recordingUrl
            : `${recordingUrl}.mp3`;

        // Run high-quality STT (Deepgram/Whisper)
        const sttResult = await transcribeAudio({
            audioUrl,
            language: session.language,
        });

        if (!isTranscriptReliable(sttResult)) {
            session.retry_count++;
            await this.sessionManager.updateSession(session);

            if (session.retry_count >= 3) {
                return buildHangupTwiML(
                    'Sorry, I could not understand your order. Please try again.',
                    session.language
                );
            }

            return buildVoicePrompt({
                promptText: "I couldn't hear that clearly. Please say your order again.",
                actionPath: GATHER_PATH,
                language: session.language,
            });
        }

        session.retry_count = 0;
        const { twiml } = await this.conversationManager.processUserInput(
            session,
            sttResult.transcript
        );

        return twiml;
    }

    /**
     * Handle call status change callback (completed, no-answer, busy, etc.)
     */
    async handleCallStatus(params: {
        callSid: string;
        callStatus: string;
        callDuration?: string;
    }): Promise<void> {
        const { callSid, callStatus, callDuration } = params;

        log.info('Call status update', { callSid, callStatus, callDuration });

        // Persist final call state
        await this.sessionManager.finaliseSession(callSid, {
            callDurationSeconds: callDuration ? parseInt(callDuration) : undefined,
            endedAt: new Date(),
        });
    }
}
