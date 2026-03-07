/**
 * Speech Processor (STT)
 * Converts audio to text using Deepgram or OpenAI Whisper.
 * Supports audio URL (from Twilio recordings) and raw audio buffers.
 */

import axios from 'axios';
import FormData from 'form-data';
import { createClient as createDeepgramClient } from '@deepgram/sdk';
import GeminiClient from 'openai'; // openai SDK used as HTTP client; Whisper fallback path only

import { env } from '../config/env';
import { createServiceLogger } from '../utils/logger';
import { STTError, ErrorCode } from '../utils/errors';
import { STTResult } from '../types';
import { SupportedLanguage } from '../types';
import { toDeepgramModel } from '../ai/languageDetector';

const log = createServiceLogger('SpeechProcessor');

// ── Deepgram client singleton ─────────────────────────────────────────────────
let deepgramClient: ReturnType<typeof createDeepgramClient> | null = null;
function getDeepgram() {
    if (!deepgramClient) {
        deepgramClient = createDeepgramClient(env.DEEPGRAM_API_KEY);
    }
    return deepgramClient;
}

// ── OpenAI client for Whisper (fallback STT — uses standard OpenAI key if set) ─
let whisperClient: GeminiClient | null = null;
function getWhisperClient() {
    if (!whisperClient) {
        // Whisper requires a real OpenAI key; Gemini key won't work here.
        // STT_PROVIDER defaults to 'deepgram' so this path is only hit if explicitly configured.
        const whisperKey = process.env.WHISPER_API_KEY ?? env.GEMINI_API_KEY;
        whisperClient = new GeminiClient({ apiKey: whisperKey, timeout: 20_000 });
    }
    return whisperClient;
}

// ── Deepgram STT ──────────────────────────────────────────────────────────────
/**
 * Transcribe audio from a URL (e.g., Twilio recording) using Deepgram.
 */
export async function transcribeAudioUrl(
    audioUrl: string,
    language: SupportedLanguage = 'en'
): Promise<STTResult> {
    const startTime = Date.now();
    log.info('Starting STT transcription', { provider: 'deepgram', audioUrl: audioUrl.slice(0, 80) });

    try {
        const deepgram = getDeepgram();
        const model = toDeepgramModel(language);

        const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
            { url: audioUrl },
            {
                model: 'nova-2',
                language: model,
                smart_format: true,
                punctuate: true,
                utterances: false,
                diarize: false,
            }
        );

        if (error) {
            throw new STTError(
                `Deepgram error: ${error.message}`,
                ErrorCode.STT_FAILED
            );
        }

        const channel = result?.results?.channels?.[0];
        const alternative = channel?.alternatives?.[0];

        if (!alternative?.transcript) {
            throw new STTError('Empty transcript from Deepgram', ErrorCode.STT_FAILED);
        }

        const latencyMs = Date.now() - startTime;
        log.info('STT completed', {
            latencyMs,
            confidence: alternative.confidence,
            wordCount: alternative.words?.length ?? 0,
        });

        // Warn if latency exceeds 500ms target
        if (latencyMs > 500) {
            log.warn('STT latency exceeded 500ms target', { latencyMs });
        }

        return {
            transcript: alternative.transcript,
            confidence: alternative.confidence ?? 0,
            language_detected: channel.detected_language,
            words: alternative.words?.map((w) => ({
                word: w.word,
                start_time: w.start,
                end_time: w.end,
                confidence: w.confidence,
            })),
            duration_ms: latencyMs,
        };
    } catch (err) {
        if (err instanceof STTError) throw err;
        throw new STTError(
            `Deepgram transcription failed: ${(err as Error).message}`,
            ErrorCode.STT_FAILED
        );
    }
}

/**
 * Transcribe audio buffer using Deepgram (for streamed audio).
 */
export async function transcribeAudioBuffer(
    audioBuffer: Buffer,
    mimeType: string = 'audio/wav',
    language: SupportedLanguage = 'en'
): Promise<STTResult> {
    const startTime = Date.now();
    log.info('Starting buffer STT transcription', { provider: 'deepgram', mimeType });

    try {
        const deepgram = getDeepgram();
        const model = toDeepgramModel(language);

        const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
            audioBuffer,
            {
                model: 'nova-2',
                language: model,
                smart_format: true,
                punctuate: true,
                mimetype: mimeType,
            }
        );

        if (error) {
            throw new STTError(`Deepgram buffer error: ${error.message}`, ErrorCode.STT_FAILED);
        }

        const alternative = result?.results?.channels?.[0]?.alternatives?.[0];
        if (!alternative?.transcript) {
            throw new STTError('Empty transcript from Deepgram buffer', ErrorCode.STT_FAILED);
        }

        return {
            transcript: alternative.transcript,
            confidence: alternative.confidence ?? 0,
            duration_ms: Date.now() - startTime,
        };
    } catch (err) {
        if (err instanceof STTError) throw err;
        throw new STTError(
            `Buffer transcription failed: ${(err as Error).message}`,
            ErrorCode.STT_FAILED
        );
    }
}

// ── Whisper STT ───────────────────────────────────────────────────────────────
/**
 * Transcribe audio buffer using OpenAI Whisper.
 */
export async function transcribeWithWhisper(
    audioBuffer: Buffer,
    filename: string = 'audio.wav',
    language: SupportedLanguage = 'en'
): Promise<STTResult> {
    const startTime = Date.now();
    log.info('Starting Whisper STT transcription');

    try {
        const openai = getWhisperClient();

        // Whisper accepts a File-like object
        const file = new File([audioBuffer], filename, { type: 'audio/wav' });

        const whisperLang = language === 'en' ? 'en' : 'hi';

        const transcription = await openai.audio.transcriptions.create({
            file,
            model: 'whisper-1',
            language: whisperLang,
            response_format: 'verbose_json',
        });

        const latencyMs = Date.now() - startTime;
        log.info('Whisper STT completed', { latencyMs });

        return {
            transcript: transcription.text,
            confidence: 0.85,  // Whisper doesn't provide per-word confidence
            duration_ms: latencyMs,
        };
    } catch (err) {
        throw new STTError(
            `Whisper transcription failed: ${(err as Error).message}`,
            ErrorCode.STT_FAILED
        );
    }
}

// ── Provider-agnostic entry point ─────────────────────────────────────────────
/**
 * Primary STT entry point. Routes to the configured provider.
 * Supports audio URL (Twilio) and raw buffer inputs.
 */
export async function transcribeAudio(params: {
    audioUrl?: string;
    audioBuffer?: Buffer;
    mimeType?: string;
    language?: SupportedLanguage;
}): Promise<STTResult> {
    const { audioUrl, audioBuffer, mimeType = 'audio/wav', language = 'en' } = params;

    if (!audioUrl && !audioBuffer) {
        throw new STTError('Either audioUrl or audioBuffer is required', ErrorCode.AUDIO_UNAVAILABLE);
    }

    if (env.STT_PROVIDER === 'whisper') {
        if (!audioBuffer) {
            // Download audio from URL first
            const buffer = await downloadAudio(audioUrl!);
            return transcribeWithWhisper(buffer, 'audio.wav', language);
        }
        return transcribeWithWhisper(audioBuffer, 'audio.wav', language);
    }

    // Default: Deepgram
    if (audioUrl) {
        return transcribeAudioUrl(audioUrl, language);
    }
    return transcribeAudioBuffer(audioBuffer!, mimeType, language);
}

/**
 * Download audio from a URL (e.g., Twilio recording with basic auth).
 */
export async function downloadAudio(
    audioUrl: string,
    twilioAuth?: { accountSid: string; authToken: string }
): Promise<Buffer> {
    try {
        const config = twilioAuth
            ? {
                auth: {
                    username: twilioAuth.accountSid,
                    password: twilioAuth.authToken,
                },
                responseType: 'arraybuffer' as const,
            }
            : { responseType: 'arraybuffer' as const };

        const response = await axios.get(audioUrl, config);
        return Buffer.from(response.data as ArrayBuffer);
    } catch (err) {
        throw new STTError(
            `Failed to download audio: ${(err as Error).message}`,
            ErrorCode.AUDIO_UNAVAILABLE
        );
    }
}

/**
 * Validate STT confidence score against threshold.
 * Returns true if the transcript is reliable enough to process.
 */
export function isTranscriptReliable(
    result: STTResult,
    threshold = 0.5
): boolean {
    return result.confidence >= threshold && result.transcript.trim().length > 2;
}
