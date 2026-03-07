/**
 * Turn Logger
 * Writes a human-readable per-session log file for every petpooja voice call.
 * Format mirrors voice_agent/logs — one file per session with per-turn timing.
 *
 * Output: logs/petpooja/YYYYMMDD_HHMMSS_<sessionId>.txt
 * (relative to process.cwd() which is petpooja/ in dev, so ../logs/petpooja/)
 *
 * Example turn block:
 *
 *   [12:03:45] USER  : add two tiramisus
 *              INTENT : ORDER_ADD               150ms  (Groq)
 *              RAG    : menu retrieval           523ms
 *              LLM    : Gemini response         2467ms
 *              BRAIN  : total processTurn       3140ms
 *              CART   : Tiramisu x2 ₹500  (−₹50 off)  →  ₹450
 *   [12:03:48] BOT   : Adding two Tiramisus...
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Log directory ─────────────────────────────────────────────────────────────
// process.cwd() = /…/hacknuthon/petpooja (in dev / Docker)
// So ../logs/petpooja resolves to /…/hacknuthon/logs/petpooja
const LOG_DIR = path.resolve(process.cwd(), '..', 'logs', 'petpooja');

// ── Internal per-session state ────────────────────────────────────────────────
interface LogSession {
    filePath: string;
    startTime: Date;
    turnCount: number;
    brainMsList: number[];  // for computing avg turn time in footer
}

const _sessions = new Map<string, LogSession>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

/** HH:MM:SS from a Date */
function hms(d: Date): string {
    return d.toTimeString().slice(0, 8);
}

/** Right-pad a string to width */
function rp(s: string, w: number): string {
    return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

/** Right-align a number (in a field of width w) */
function rn(n: number, w = 5): string {
    return String(n).padStart(w);
}

/** Get-or-create a LogSession (lazy file creation) */
function getOrCreate(sessionId: string): LogSession {
    const existing = _sessions.get(sessionId);
    if (existing) return existing;

    ensureDir();

    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timePart = hms(now).replace(/:/g, '');
    const safeSid = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36);
    const fileName = `${datePart}_${timePart}_${safeSid}.txt`;
    const filePath = path.join(LOG_DIR, fileName);

    const startedAt = now.toISOString().replace('T', ' ').slice(0, 19);
    const header = [
        '='.repeat(66),
        '  Petpooja Brain  --  Turn-by-Turn Call Log',
        '='.repeat(66),
        `Session     : ${sessionId}`,
        `Started     : ${startedAt}`,
        '-'.repeat(66),
        '',
    ].join('\n');

    fs.writeFileSync(filePath, header + '\n', 'utf8');

    const sess: LogSession = {
        filePath,
        startTime: now,
        turnCount: 0,
        brainMsList: [],
    };
    _sessions.set(sessionId, sess);
    return sess;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TurnLogData {
    userText: string;
    botText: string;
    intent: string;
    intent_ms: number | null;
    rag_ms: number | null;
    llm_ms: number | null;
    brain_ms: number;
    cart: { name: string; qty: number; lineTotal: number }[];
    cartTotal: number;
    appliedDiscount: number;
    netTotal: number;
}

/**
 * Append one user↔bot turn to the session log file.
 * Creates the file lazily on first call (no startSession() required).
 * Never throws — errors are silently swallowed so the main request path is safe.
 */
export function logTurn(sessionId: string, data: TurnLogData): void {
    try {
        const sess = getOrCreate(sessionId);
        sess.turnCount += 1;
        sess.brainMsList.push(data.brain_ms);

        const ts = hms(new Date());

        // ── Timing rows ──────────────────────────────────────────────────────
        const intentLabel = rp(data.intent, 20);
        const intentRow = data.intent_ms !== null
            ? `${intentLabel} ${rn(data.intent_ms)}ms  (Groq llama)`
            : `${intentLabel}   n/a`;

        const ragRow = data.rag_ms !== null
            ? `${rp('menu retrieval', 22)} ${rn(data.rag_ms)}ms`
            : `${rp('menu retrieval', 22)}   n/a`;

        const llmRow = data.llm_ms !== null
            ? `${rp('Gemini response', 22)} ${rn(data.llm_ms)}ms`
            : `${rp('Gemini response', 22)}   n/a`;

        const brainRow = `${rp('total processTurn', 22)} ${rn(data.brain_ms)}ms`;

        // ── Cart summary ─────────────────────────────────────────────────────
        let cartLine: string;
        if (data.cart.length === 0) {
            cartLine = 'empty';
        } else {
            const items = data.cart.map(i => `${i.name} x${i.qty} ₹${i.lineTotal}`).join('  +  ');
            const discStr = data.appliedDiscount > 0 ? `  (−₹${data.appliedDiscount} off)` : '';
            cartLine = `${items}${discStr}  →  ₹${data.netTotal}`;
        }

        // ── Block ────────────────────────────────────────────────────────────
        const block = [
            `[${ts}] USER  : ${data.userText}`,
            `           INTENT : ${intentRow}`,
            `           RAG    : ${ragRow}`,
            `           LLM    : ${llmRow}`,
            `           BRAIN  : ${brainRow}`,
            `           CART   : ${cartLine}`,
            `[${ts}] BOT   : ${data.botText}`,
            '',
        ].join('\n');

        fs.appendFileSync(sess.filePath, block + '\n', 'utf8');
    } catch {
        // best-effort — never crash the main request path
    }
}

/**
 * Write a summary footer and close the log session.
 * Call when the call ends (isComplete=true or sessionEnd).
 * Safe to call multiple times; second call is a no-op.
 */
export function endSessionLog(
    sessionId: string,
    cart: { name: string; qty: number; lineTotal: number }[],
    appliedDiscount: number,
    netTotal: number,
): void {
    try {
        const sess = _sessions.get(sessionId);
        if (!sess) return;

        const now = new Date();
        const durSecs = Math.round((now.getTime() - sess.startTime.getTime()) / 1000);
        const avgMs = sess.brainMsList.length > 0
            ? Math.round(sess.brainMsList.reduce((a, b) => a + b, 0) / sess.brainMsList.length)
            : 0;

        const itemsSummary = cart.length > 0
            ? cart.map(i => `${i.name} x${i.qty} = ₹${i.lineTotal}`).join(',  ')
            : 'no items';
        const discNote = appliedDiscount > 0
            ? `  (−₹${appliedDiscount} discount  →  net ₹${netTotal})`
            : '';

        const endedAt = now.toISOString().replace('T', ' ').slice(0, 19);
        const footer = [
            '-'.repeat(66),
            `Items Ordered  : ${itemsSummary}${discNote}`,
            `Avg Turn Time  : ${(avgMs / 1000).toFixed(1)}s`,
            `Total Turns    : ${sess.turnCount}`,
            `Call Duration  : ${durSecs}s`,
            `Ended          : ${endedAt}`,
            '='.repeat(66),
            '',
        ].join('\n');

        fs.appendFileSync(sess.filePath, footer, 'utf8');
        _sessions.delete(sessionId);
    } catch {
        // best-effort
    }
}
