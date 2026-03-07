/**
 * In-Memory Store (Redis drop-in for hackathon)
 * Same exported API as the ioredis version — no external dependency needed.
 */

// ── Internal store ────────────────────────────────────────────────────────────
interface Entry { value: string; expiresAt?: number }
const store = new Map<string, Entry>();

function isExpired(entry: Entry): boolean {
    return entry.expiresAt !== undefined && Date.now() > entry.expiresAt;
}

// Fake client object so callers that use getRedisClient() directly still work
const fakeClient = {
    ping: async () => 'PONG',
    get: async (key: string) => {
        const e = store.get(key);
        if (!e || isExpired(e)) { store.delete(key); return null; }
        return e.value;
    },
    set: async (key: string, value: string) => { store.set(key, { value }); return 'OK'; },
    setex: async (key: string, ttl: number, value: string) => {
        store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
        return 'OK';
    },
    del: async (...keys: string[]) => {
        keys.forEach((k) => store.delete(k));
        return keys.length;
    },
    disconnect: () => { /* no-op */ },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRedisClient(): any {
    return fakeClient;
}

// ── Key builders ──────────────────────────────────────────────────────────────
export const RedisKeys = {
    session: (callSid: string) => `session:${callSid}`,
    menuCache: (restaurantId: string) => `menu:${restaurantId}`,
    orderLock: (orderId: string) => `lock:order:${orderId}`,
    upsellRules: (restaurantId: string) => `upsell:${restaurantId}`,
    rateLimit: (ip: string) => `rate:${ip}`,
};

// ── Typed helpers (same signature as ioredis version) ────────────────────────
export async function redisSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialised = JSON.stringify(value);
    if (ttlSeconds) {
        store.set(key, { value: serialised, expiresAt: Date.now() + ttlSeconds * 1000 });
    } else {
        store.set(key, { value: serialised });
    }
}

export async function redisGet<T>(key: string): Promise<T | null> {
    const e = store.get(key);
    if (!e || isExpired(e)) { store.delete(key); return null; }
    try { return JSON.parse(e.value) as T; } catch { return null; }
}

export async function redisDel(key: string): Promise<void> {
    store.delete(key);
}

export async function redisLock(key: string, _ttlSeconds = 30): Promise<boolean> {
    if (store.has(key) && !isExpired(store.get(key)!)) return false;
    store.set(key, { value: '1', expiresAt: Date.now() + _ttlSeconds * 1000 });
    return true;
}

export async function redisUnlock(key: string): Promise<void> {
    store.delete(key);
}
