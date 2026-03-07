/**
 * TTS Service
 * Text-to-Speech helper that returns TwiML-compatible voice instructions.
 * Supports Twilio native TTS and ElevenLabs for premium voice quality.
 */

import axios from 'axios';
import { env } from '../config/env';
import { createServiceLogger } from '../utils/logger';
import { SupportedLanguage } from '../types';

const log = createServiceLogger('TTSService');

// ── Voice configuration per language ─────────────────────────────────────────
const TWILIO_VOICES: Record<SupportedLanguage, string> = {
    en: 'Polly.Aditi',        // Indian English — Amazon Polly via Twilio
    hi: 'Polly.Aditi',        // Hindi (Polly.Aditi speaks both)
    hinglish: 'Polly.Aditi',
};

const TWILIO_LANGUAGE_CODES: Record<SupportedLanguage, string> = {
    en: 'en-IN',
    hi: 'hi-IN',
    hinglish: 'hi-IN',
};

/**
 * Generate TwiML <Say> XML for a given message.
 * Used inside Twilio response builders.
 */
export function buildSayTwiML(
    text: string,
    language: SupportedLanguage = 'en'
): string {
    const voice = TWILIO_VOICES[language];
    const langCode = TWILIO_LANGUAGE_CODES[language];
    // Escape XML special characters
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return `<Say voice="${voice}" language="${langCode}">${escaped}</Say>`;
}

/**
 * Generate TwiML <Gather> XML that captures speech input.
 * @param promptText   - What to say to the customer
 * @param actionPath   - Relative webhook path to POST the result to
 * @param language     - Language for speech recognition
 * @param speechTimeout - Seconds of silence before ending gather
 */
export function buildGatherTwiML(params: {
    promptText: string;
    actionPath: string;
    language?: SupportedLanguage;
    speechTimeout?: number;
    enhanced?: boolean;
}): string {
    const {
        promptText,
        actionPath,
        language = 'en',
        speechTimeout = 3,
        enhanced = true,
    } = params;

    const langCode = TWILIO_LANGUAGE_CODES[language];
    const sayTwiml = buildSayTwiML(promptText, language);

    return `
<Gather
  input="speech"
  action="${actionPath}"
  method="POST"
  language="${langCode}"
  speechTimeout="${speechTimeout}"
  enhanced="${enhanced}"
  speechModel="phone_call"
  profanityFilter="false">
  ${sayTwiml}
</Gather>`.trim();
}

/**
 * Wrap TwiML fragments inside a <Response> element.
 */
export function buildTwiMLResponse(body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${body}\n</Response>`;
}

/**
 * Build a complete TwiML response for prompting the caller with speech capture.
 */
export function buildVoicePrompt(params: {
    promptText: string;
    actionPath: string;
    language?: SupportedLanguage;
    fallbackText?: string;
    speechTimeout?: number;
}): string {
    const { promptText, actionPath, language = 'en', fallbackText, speechTimeout } = params;

    const gather = buildGatherTwiML({ promptText, actionPath, language, speechTimeout });

    // Fallback: if Gather times out, this executes
    const fallback = fallbackText
        ? buildSayTwiML(fallbackText, language)
        : buildSayTwiML(
            language === 'en'
                ? "I'm sorry, I didn't catch that. Please call again."
                : 'माफ़ करें, समझ नहीं आया। कृपया फिर से कॉल करें।',
            language
        );

    return buildTwiMLResponse(`${gather}\n  ${fallback}`);
}

/**
 * Build a hangup TwiML with a final goodbye message.
 */
export function buildHangupTwiML(
    goodbyeText: string,
    language: SupportedLanguage = 'en'
): string {
    const say = buildSayTwiML(goodbyeText, language);
    return buildTwiMLResponse(`${say}\n  <Hangup/>`);
}

/**
 * Build a TwiML response that redirects to another webhook endpoint.
 */
export function buildRedirectTwiML(url: string): string {
    return buildTwiMLResponse(`<Redirect method="POST">${url}</Redirect>`);
}

/**
 * Generate audio via ElevenLabs and return the audio Buffer.
 * Used when higher-quality TTS is needed (optional / premium tier).
 */
export async function synthesiseWithElevenLabs(
    text: string,
    voiceId?: string
): Promise<Buffer> {
    const vid = voiceId || env.ELEVENLABS_VOICE_ID;

    if (!env.ELEVENLABS_API_KEY || !vid) {
        throw new Error('ElevenLabs API key and voice ID must be configured');
    }

    log.info('Calling ElevenLabs TTS', { voiceId: vid, textLen: text.length });

    const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${vid}`,
        {
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
            },
        },
        {
            headers: {
                'xi-api-key': env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                Accept: 'audio/mpeg',
            },
            responseType: 'arraybuffer',
            timeout: 10_000,
        }
    );

    return Buffer.from(response.data as ArrayBuffer);
}
