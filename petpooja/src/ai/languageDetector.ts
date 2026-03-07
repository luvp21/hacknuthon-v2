/**
 * Language Detector
 * Lightweight heuristic-based language detection for English / Hindi / Hinglish.
 * Used before calling the LLM to set the language context.
 */

import { SupportedLanguage } from '../types';
import { createServiceLogger } from '../utils/logger';

const log = createServiceLogger('LanguageDetector');

// ── Common Hindi words in Devanagari script ───────────────────────────────────
const DEVANAGARI_RANGE = /[\u0900-\u097F]/;

// ── Common Hinglish trigger words (Romanised Hindi) ───────────────────────────
const HINGLISH_KEYWORDS = new Set([
    'ek', 'do', 'teen', 'char', 'paanch', 'chhe', 'saat', 'aath', 'nau', 'das',
    'bhai', 'yaar', 'haan', 'nahi', 'kya', 'aur', 'wala', 'wali', 'lena', 'dena',
    'chahiye', 'mujhe', 'mera', 'meri', 'acha', 'theek', 'bas', 'matlab',
    'paneer', 'naan', 'roti', 'daal', 'sabzi', 'masala', 'biryani', 'tikka',
    'lassi', 'chai', 'pani', 'thoda', 'zyada', 'bahut', 'sirf', 'toh', 'bhi',
]);

// ── English-only indicators ───────────────────────────────────────────────────
const ENGLISH_ONLY_KEYWORDS = new Set([
    'please', 'would', 'like', 'want', 'order', 'give', 'add', 'remove',
    'can', 'could', 'actually', 'also', 'and', 'with', 'without', 'some',
]);

/**
 * Detect the language of an input string.
 * Returns 'hi' for pure Hindi (Devanagari), 'hinglish' for mixed/Romanised,
 * or 'en' for English.
 */
export function detectLanguage(text: string): SupportedLanguage {
    if (!text || text.trim().length === 0) return 'en';

    const lower = text.toLowerCase().trim();
    const words = lower.split(/\s+/);

    // If Devanagari characters present → Hindi
    if (DEVANAGARI_RANGE.test(text)) {
        log.debug('Devanagari detected → Hindi');
        return 'hi';
    }

    // Count Hinglish vs English-only keywords
    let hinglishScore = 0;
    let englishScore = 0;

    for (const word of words) {
        if (HINGLISH_KEYWORDS.has(word)) hinglishScore++;
        if (ENGLISH_ONLY_KEYWORDS.has(word)) englishScore++;
    }

    // If any Hinglish keyword found → Hinglish
    if (hinglishScore > 0) {
        log.debug('Hinglish keywords detected', { hinglishScore, englishScore });
        return 'hinglish';
    }

    return 'en';
}

/**
 * Heuristic confidence score for language detection (0.0 – 1.0).
 */
export function detectLanguageWithConfidence(
    text: string
): { language: SupportedLanguage; confidence: number } {
    const language = detectLanguage(text);

    const lower = text.toLowerCase().trim();
    const words = lower.split(/\s+/);

    let score = 0.6; // Base confidence

    if (language === 'hi' && DEVANAGARI_RANGE.test(text)) {
        score = 0.95;
    } else if (language === 'hinglish') {
        const hinglishWords = words.filter((w) => HINGLISH_KEYWORDS.has(w));
        score = Math.min(0.95, 0.6 + hinglishWords.length * 0.1);
    } else {
        // English: higher confidence if no Hindi indicators
        const hasHindi = words.some((w) => HINGLISH_KEYWORDS.has(w));
        score = hasHindi ? 0.6 : 0.85;
    }

    return { language, confidence: score };
}

/**
 * Normalise numbers from Hindi/Hinglish to Arabic numerals.
 * E.g. "do paneer tikka" → "2 paneer tikka"
 */
export function normaliseNumbers(text: string): string {
    const HINDI_NUMERALS: Record<string, string> = {
        ek: '1', do: '2', teen: '3', char: '4',
        paanch: '5', chhe: '6', saat: '7', aath: '8', nau: '9', das: '10',
        // Devanagari digits
        '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
        '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
    };

    let result = text.toLowerCase();
    for (const [hindi, arabic] of Object.entries(HINDI_NUMERALS)) {
        result = result.replace(new RegExp(`\\b${hindi}\\b`, 'gi'), arabic);
    }
    return result;
}

/**
 * Returns the Twilio speech language code for a given SupportedLanguage.
 */
export function toTwilioLanguageCode(lang: SupportedLanguage): string {
    switch (lang) {
        case 'hi':
            return 'hi-IN';
        case 'hinglish':
            return 'hi-IN';  // Twilio doesn't have Hinglish — use Hindi model
        default:
            return 'en-IN';  // Indian English for better accent recognition
    }
}

/**
 * Returns the Deepgram language model code.
 */
export function toDeepgramModel(lang: SupportedLanguage): string {
    switch (lang) {
        case 'hi':
            return 'hi';
        case 'hinglish':
            return 'hi';
        default:
            return 'en-IN';
    }
}
