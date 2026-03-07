/**
 * Queue Manager — no-op stub for hackathon mode.
 * BullMQ/Redis queues removed; POS submission is handled directly in orderService.
 */

import { createServiceLogger } from '../utils/logger';

const log = createServiceLogger('QueueManager');

export const QUEUE_NAMES = {
    ORDER: 'order-processing',
    POS: 'pos-submission',
    NOTIFICATIONS: 'notifications',
} as const;

export async function initQueues(): Promise<void> {
    log.info('Queue manager: no-op mode (hackathon)');
}

export async function closeQueues(): Promise<void> {
    log.info('Queue manager: nothing to close');
}

export function getOrderQueue(): never {
    throw new Error('Queue system disabled in hackathon mode');
}

export function getPOSQueue(): never {
    throw new Error('Queue system disabled in hackathon mode');
}

export async function getQueueStats(): Promise<Record<string, { waiting: number; active: number; failed: number }>> {
    return {};
}

