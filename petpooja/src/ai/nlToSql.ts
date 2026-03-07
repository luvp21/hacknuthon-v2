/**
 * NL→SQL Engine
 * Converts natural language questions (customer queries + internal lookups)
 * to SQL using SQLCoder-7b via Cloudflare Workers AI.
 * Falls back to GPT-4o if Cloudflare is unavailable or returns an error.
 *
 * Architecture: Brain → nlToSql → SQL → Postgres → structured result → Dialogue Generator
 */

import { env } from '../config/env';
import { getPostgresPool } from '../database/postgres';
import { createServiceLogger } from '../utils/logger';
import { extractJSON } from '../utils/helpers';

const log = createServiceLogger('NLToSQL');

// ── DB schema string passed to SQLCoder ───────────────────────────────────────
// Keep this in sync with actual migrations — SQLCoder needs accurate schema.
const POS_DB_SCHEMA = `
CREATE TABLE restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tax_rate NUMERIC(5,2) DEFAULT 5.00
);

CREATE TABLE menu_categories (
  id UUID PRIMARY KEY,
  restaurant_id TEXT REFERENCES restaurants(id),
  name TEXT NOT NULL,
  display_order INT DEFAULT 0,
  is_available BOOLEAN DEFAULT TRUE
);

CREATE TABLE menu_items (
  id UUID PRIMARY KEY,
  restaurant_id TEXT REFERENCES restaurants(id),
  category_id UUID REFERENCES menu_categories(id),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  name_hi TEXT,
  name_hinglish TEXT,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  food_cost NUMERIC(10,2),
  is_available BOOLEAN DEFAULT TRUE,
  is_vegetarian BOOLEAN DEFAULT FALSE,
  is_vegan BOOLEAN DEFAULT FALSE,
  tags TEXT[] DEFAULT '{}',
  display_order INT DEFAULT 0,
  -- Rich attributes for recommendation queries
  cuisine TEXT,            -- e.g. 'Indian', 'Italian', 'Chinese', 'Mexican', 'Continental'
  course_type TEXT,        -- 'starter','soup','salad','bread','main_course','rice_noodle','side','dessert','beverage','snack','combo'
  flavor_profile TEXT[],   -- e.g. '{spicy,creamy}', '{sweet,tangy}', '{mild,rich}'
  dietary_tags TEXT[],     -- e.g. '{gluten_free,jain}', '{keto,dairy_free}'
  spice_level SMALLINT,    -- 0=none, 1=mild, 2=medium, 3=hot, 4=extra_hot
  is_bestseller BOOLEAN DEFAULT FALSE,
  is_new_item BOOLEAN DEFAULT FALSE,
  is_chefs_pick BOOLEAN DEFAULT FALSE,
  serves SMALLINT DEFAULT 1,
  prep_time_min SMALLINT
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  restaurant_id TEXT REFERENCES restaurants(id),
  items JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'collecting',
  subtotal NUMERIC(10,2),
  total_amount NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`.trim();

// ── Strip SQLCoder artifacts (markdown fences, trailing prose after semicolon) ─
function cleanupSQL(raw: string): string {
    // Remove markdown code fences (```sql ... ```)
    let sql = raw.replace(/```sql?\s*/gi, '').replace(/```/g, '');
    // Take only up to and including the first semicolon (SQLCoder sometimes appends text)
    const semiIdx = sql.indexOf(';');
    if (semiIdx !== -1) sql = sql.slice(0, semiIdx + 1);
    // Remove surrounding whitespace and spurious line breaks
    return sql.trim();
}

// ── SQLCoder prompt template (as per Cloudflare docs) ─────────────────────────
function buildSQLCoderPrompt(question: string): string {
    return `### Task
Generate a PostgreSQL SELECT query to answer the question below.
Output ONLY the raw SQL — no explanations, no markdown, no backticks.
Always include WHERE restaurant_id = '${env.DEFAULT_RESTAURANT_ID}' unless the question spans all restaurants.
Never use INSERT, UPDATE, DELETE, DROP, ALTER, or CREATE.

### Database Schema
${POS_DB_SCHEMA}

### Useful query patterns
-- Spicy starters:
SELECT name, price, spice_level FROM menu_items WHERE restaurant_id = '${env.DEFAULT_RESTAURANT_ID}' AND course_type = 'starter' AND spice_level >= 2 AND is_available = TRUE ORDER BY spice_level DESC;

-- Creamy dishes:
SELECT name, price, flavor_profile FROM menu_items WHERE restaurant_id = '${env.DEFAULT_RESTAURANT_ID}' AND 'creamy' = ANY(flavor_profile) AND is_available = TRUE;

-- Italian cuisine under price:
SELECT name, price, cuisine FROM menu_items WHERE restaurant_id = '${env.DEFAULT_RESTAURANT_ID}' AND lower(cuisine) = 'italian' AND price < 300 AND is_available = TRUE;

-- Vegan desserts:
SELECT name, price FROM menu_items WHERE restaurant_id = '${env.DEFAULT_RESTAURANT_ID}' AND course_type = 'dessert' AND is_vegan = TRUE AND is_available = TRUE;

-- Bestsellers:
SELECT name, price, course_type FROM menu_items WHERE restaurant_id = '${env.DEFAULT_RESTAURANT_ID}' AND is_bestseller = TRUE AND is_available = TRUE ORDER BY price;

-- Something mild and creamy under 400:
SELECT name, price FROM menu_items WHERE restaurant_id = '${env.DEFAULT_RESTAURANT_ID}' AND spice_level <= 1 AND 'creamy' = ANY(flavor_profile) AND price <= 400 AND is_available = TRUE;

-- All starters that are vegetarian:
SELECT name, price FROM menu_items WHERE restaurant_id = '${env.DEFAULT_RESTAURANT_ID}' AND course_type = 'starter' AND is_vegetarian = TRUE AND is_available = TRUE ORDER BY price;

### Question
${question}

### SQL
`;
}

// ── Result row type ───────────────────────────────────────────────────────────
export type SQLQueryRow = Record<string, unknown>;

export interface NLQueryResult {
    question: string;
    sql: string;
    rows: SQLQueryRow[];
    rowCount: number;
    error?: string;
    source: 'cloudflare' | 'gpt4o_fallback';
}

// ── Cloudflare Workers AI call ────────────────────────────────────────────────
async function generateSQLWithCloudflare(question: string): Promise<string> {
    if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
        throw new Error('Cloudflare credentials not configured');
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/defog/sqlcoder-7b-2`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            prompt: buildSQLCoderPrompt(question),
            max_tokens: 300,
        }),
    });

    if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { result?: { response?: string } };
    const raw: string = data?.result?.response ?? '';
    if (!raw.trim()) throw new Error('SQLCoder returned empty response');

    return cleanupSQL(raw);
}

// ── Gemini fallback for SQL generation ──────────────────────────────────────────
async function generateSQLWithGPT4o(question: string): Promise<string> {
    const GeminiClient = (await import('openai')).default; // openai SDK as HTTP client for Gemini
    const client = new GeminiClient({
        apiKey: env.GEMINI_API_KEY,
        baseURL: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
        timeout: 15_000,
    });

    const systemPrompt = `You are a PostgreSQL expert. Generate ONLY a SQL SELECT query.
No explanations. No markdown. No backticks. Just the raw SQL ending with a semicolon.
Always filter by restaurant_id = '${env.DEFAULT_RESTAURANT_ID}'.
Only SELECT — never INSERT, UPDATE, DELETE, DROP, ALTER, or CREATE.
For recommendation queries use columns: cuisine, course_type, flavor_profile (TEXT[]), spice_level (0-4), is_vegetarian, is_vegan, dietary_tags (TEXT[]), is_bestseller.
Array membership syntax: 'value' = ANY(column) — e.g. 'spicy' = ANY(flavor_profile).

Database schema:
${POS_DB_SCHEMA}`;

    const response = await client.chat.completions.create({
        model: env.GEMINI_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question },
        ],
        temperature: 0,
        max_tokens: 512,
        response_format: { type: 'text' },
    });

    const sql = response.choices[0]?.message?.content ?? '';
    if (!sql.trim()) throw new Error('GPT-4o returned empty SQL');

    // Strip any accidental markdown fences
    return sql.replace(/```sql?/gi, '').replace(/```/g, '').trim();
}

// ── SQL safety guard ──────────────────────────────────────────────────────────
function isSafeSQL(sql: string): boolean {
    const upper = sql.toUpperCase().trim();
    // Only allow SELECT statements
    if (!upper.startsWith('SELECT')) return false;
    // Block mutation keywords
    const blocked = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE'];
    return !blocked.some((kw) => upper.includes(kw));
}

// ── Execute SQL against Postgres (read-only) ─────────────────────────────────
async function executeSQL(sql: string, restaurantId: string): Promise<SQLQueryRow[]> {
    // Inject restaurant filter if not already present
    const safeSQL = sql.includes('restaurant_id')
        ? sql
        : sql.replace(/WHERE/i, `WHERE restaurant_id = '${restaurantId}' AND`)
            .replace(/FROM\s+\w+\s*$/i, `$& WHERE restaurant_id = '${restaurantId}'`);

    const pool = getPostgresPool();
    // LIMIT to 50 rows max — we're answering voice queries, not running reports
    const limitedSQL = safeSQL.includes('LIMIT')
        ? safeSQL
        : `${safeSQL.replace(/;?\s*$/, '')} LIMIT 50`;

    const result = await pool.query(limitedSQL);
    return result.rows;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Execute a natural language query against the restaurant's POS database.
 * Primary: Cloudflare Workers AI (SQLCoder-7b-2)
 * Fallback: GPT-4o
 */
export async function executeNLQuery(
    question: string,
    restaurantId: string = env.DEFAULT_RESTAURANT_ID
): Promise<NLQueryResult> {
    const start = Date.now();
    let sql = '';
    let source: NLQueryResult['source'] = 'cloudflare';

    // 1. Try Cloudflare Workers AI (SQLCoder-7b)
    try {
        sql = await generateSQLWithCloudflare(question);
        log.debug('SQLCoder generated SQL', { sql: sql.slice(0, 200) });
    } catch (cfErr) {
        log.warn('Cloudflare SQLCoder failed, falling back to GPT-4o', {
            error: (cfErr as Error).message,
        });

        // 2. Fallback to GPT-4o
        try {
            sql = await generateSQLWithGPT4o(question);
            source = 'gpt4o_fallback';
            log.debug('GPT-4o generated SQL', { sql: sql.slice(0, 200) });
        } catch (gptErr) {
            log.error('Both SQL generators failed', { error: (gptErr as Error).message });
            return {
                question,
                sql: '',
                rows: [],
                rowCount: 0,
                error: 'Could not generate SQL for this question',
                source: 'gpt4o_fallback',
            };
        }
    }

    // 3. Safety check
    if (!isSafeSQL(sql)) {
        log.warn('Unsafe SQL blocked', { sql });
        return { question, sql, rows: [], rowCount: 0, error: 'Unsafe query blocked', source };
    }

    // 4. Execute
    try {
        const rows = await executeSQL(sql, restaurantId);
        log.info('NL→SQL query executed', {
            question: question.slice(0, 80),
            rowCount: rows.length,
            latencyMs: Date.now() - start,
            source,
        });
        return { question, sql, rows, rowCount: rows.length, source };
    } catch (execErr) {
        log.error('SQL execution failed', { sql, error: (execErr as Error).message });
        return {
            question,
            sql,
            rows: [],
            rowCount: 0,
            error: `SQL execution error: ${(execErr as Error).message}`,
            source,
        };
    }
}

/**
 * Format SQL query results into a human-readable summary for the Dialogue Generator.
 * Used to pass structured data into the response prompt.
 */
export function formatQueryResultForLLM(result: NLQueryResult): string {
    if (result.error) return `Query failed: ${result.error}`;
    if (result.rowCount === 0) return 'No matching items found.';

    const PRICE_KEYS = new Set(['price', 'food_cost', 'subtotal', 'total_amount']);
    const SKIP_KEYS = new Set(['id', 'restaurant_id', 'category_id', 'pos_item_id', 'search_vector', 'created_at', 'updated_at']);

    const lines = result.rows.slice(0, 10).map((row, i) => {
        const pairs = Object.entries(row)
            .filter(([k]) => !SKIP_KEYS.has(k) && row[k] !== null && row[k] !== '')
            .map(([k, v]) => {
                // Format arrays cleanly
                if (Array.isArray(v)) {
                    return v.length ? `${k}: ${(v as unknown[]).join(', ')}` : null;
                }
                // Format prices with ₹
                if (PRICE_KEYS.has(k) && typeof v === 'number') {
                    return `${k}: ₹${v}`;
                }
                // Spice level to label
                if (k === 'spice_level' && typeof v === 'number') {
                    const labels = ['none', 'mild', 'medium', 'hot', 'extra hot'];
                    return `spice: ${labels[v as number] ?? v}`;
                }
                return `${k}: ${v}`;
            })
            .filter(Boolean);
        return `${i + 1}. ${pairs.join(' | ')}`;
    });

    const suffix = result.rowCount > 10 ? `\n... and ${result.rowCount - 10} more` : '';
    return lines.join('\n') + suffix;
}
