/**
 * Context Summarizer
 * Compresses long conversation histories into a compact summary
 * so GPT-4o never exceeds context limits on long calls.
 * Also builds the bounded context window passed to every LLM call.
 */

import GeminiClient from 'openai'; // openai SDK used as HTTP client for Gemini's OpenAI-compatible endpoint
import { env } from '../config/env';
import { createServiceLogger } from '../utils/logger';
import { ConversationTurn, SessionContext } from '../conversation/sessionStore';
import { buildBrainSystemPrompt } from '../ai/promptTemplates';
import { MenuService } from '../menu/menuService';

const log = createServiceLogger('ContextSummarizer');

const menuService = new MenuService();

let _client: GeminiClient | null = null;
function getClient(): GeminiClient {
    if (!_client) {
        _client = new GeminiClient({
            apiKey: env.GEMINI_API_KEY,
            baseURL: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
            timeout: 15_000,
            maxRetries: 2,
        });
    }
    return _client;
}

/**
 * Summarize a list of conversation turns into 3 sentences or fewer.
 * Covers: items ordered, customer preferences, special requests.
 * Returns the summary string to be saved in session.contextSummary.
 */
export async function summarizeHistory(
    sessionId: string,
    turns: ConversationTurn[]
): Promise<string> {
    if (!turns.length) return '';

    const formatted = turns
        .map((t) => {
            const speaker = t.role === 'user' ? 'Customer' : 'Assistant';
            return `${speaker}: ${t.content}`;
        })
        .join('\n');

    const client = getClient();

    const response = await client.chat.completions.create({
        model: env.GEMINI_MODEL,
        messages: [
            {
                role: 'system',
                content:
                    'Summarize this restaurant ordering conversation compactly. ' +
                    'Include: items ordered so far, customer preferences, any special requests. ' +
                    'Be brief — max 3 sentences.',
            },
            {
                role: 'user',
                content: formatted,
            },
        ],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: 'text' },
    });

    const summary = response.choices[0]?.message?.content?.trim() ?? '';
    log.info('History summarized', { sessionId, summaryLength: summary.length });
    return summary;
}

/**
 * Build a bounded context window for a GPT-4o call.
 *
 * Strategy:
 *  - turnCount <= 20 → all turns as messages
 *  - turnCount > 20  → [ system: summary ] + last 10 turns
 * Always prepends the restaurant system prompt as the first message.
 */
export async function buildContextWindow(
    session: SessionContext
): Promise<{ role: 'user' | 'assistant' | 'system'; content: string }[]> {
    const menuItems = await menuService.getAvailableItems(session.restaurantId);
    const restaurantName = await menuService.getRestaurantName(session.restaurantId);

    const menuSummary = menuItems
        .filter((m) => m.is_available)
        .map((m) => `- ${m.name} ₹${m.price}`)
        .join('\n');

    const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
        { role: 'system', content: buildBrainSystemPrompt(restaurantName, menuSummary) },
    ];

    if (session.turnCount > 20 && session.contextSummary) {
        messages.push({
            role: 'system',
            content: `Conversation so far: ${session.contextSummary}`,
        });

        // last 10 turns
        const last10 = session.turns.slice(-10);
        for (const t of last10) {
            messages.push({ role: t.role, content: t.content });
        }
    } else {
        for (const t of session.turns) {
            messages.push({ role: t.role, content: t.content });
        }
    }

    return messages;
}
