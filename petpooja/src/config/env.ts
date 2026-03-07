/**
 * Environment Configuration
 * Validates all required environment variables at startup using Zod.
 * The application will fail fast if required env vars are missing.
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env file relative to project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
    // Server
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    HOST: z.string().default('0.0.0.0'),
    API_BASE_URL: z.string().url('API_BASE_URL must be a valid URL'),

    // PostgreSQL
    DB_HOST: z.string().default('localhost'),
    DB_PORT: z.coerce.number().default(5432),
    DB_NAME: z.string().default('voice_ordering'),
    DB_USER: z.string().default('postgres'),
    DB_PASSWORD: z.string(),
    DB_POOL_MIN: z.coerce.number().default(2),
    DB_POOL_MAX: z.coerce.number().default(20),

    // LLM — Gemini via OpenAI-compatible endpoint
    GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
    GEMINI_BASE_URL: z.string().optional().default('https://generativelanguage.googleapis.com/v1beta/openai/'),
    GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
    GEMINI_MAX_TOKENS: z.coerce.number().default(1024),
    GEMINI_TEMPERATURE: z.coerce.number().default(0.2),

    // Deepgram
    DEEPGRAM_API_KEY: z.string().optional().default(''),
    STT_PROVIDER: z.enum(['deepgram', 'whisper']).default('deepgram'),

    // Twilio (optional — not needed for REST/LLM-only testing)
    TWILIO_ACCOUNT_SID: z.string().optional().default(''),
    TWILIO_AUTH_TOKEN: z.string().optional().default(''),
    TWILIO_PHONE_NUMBER: z.string().optional().default(''),
    TWILIO_WEBHOOK_SECRET: z.string().optional().default(''),

    // TTS
    TTS_PROVIDER: z.enum(['twilio', 'elevenlabs', 'google']).default('twilio'),
    ELEVENLABS_API_KEY: z.string().optional().default(''),
    ELEVENLABS_VOICE_ID: z.string().optional().default(''),

    // POS
    POS_PROVIDER: z
        .enum(['generic', 'petpooja', 'urbanpiper', 'posist'])
        .default('generic'),
    POS_API_BASE_URL: z.string().url().optional().default('http://localhost:9000'),
    POS_API_KEY: z.string().min(1, 'POS_API_KEY is required'),
    POS_RESTAURANT_ID: z.string().min(1, 'POS_RESTAURANT_ID is required'),
    POS_RETRY_ATTEMPTS: z.coerce.number().default(3),
    POS_RETRY_DELAY_MS: z.coerce.number().default(2000),

    // Security
    API_SECRET_KEY: z.string().min(32, 'API_SECRET_KEY must be at least 32 chars'),
    RATE_LIMIT_MAX: z.coerce.number().default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

    // Restaurant
    DEFAULT_RESTAURANT_ID: z.string().default('rest_001'),
    DEFAULT_LANGUAGE: z.enum(['en', 'hi', 'hinglish']).default('en'),

    // Cloudflare Workers AI (NL→SQL via SQLCoder-7b-2) — optional, falls back to GPT-4o
    CLOUDFLARE_ACCOUNT_ID: z.string().optional().default(''),
    CLOUDFLARE_API_TOKEN: z.string().optional().default(''),

    // Groq (fast intent classification — llama-3.1-8b-instant)
    GROQ_API_KEY: z.string().optional().default(''),
    GROQ_INTENT_MODEL: z.string().optional().default('llama-3.1-8b-instant'),

    // Logging
    LOG_LEVEL: z
        .enum(['error', 'warn', 'info', 'debug'])
        .default('info'),
    LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
});

// Parse and validate. Will throw detailed error if validation fails.
const _parsed = envSchema.safeParse(process.env);

if (!_parsed.success) {
    console.error('❌  Invalid environment configuration:\n');
    _parsed.error.issues.forEach((issue) => {
        console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
}

export const env = _parsed.data;
export type Env = typeof env;
