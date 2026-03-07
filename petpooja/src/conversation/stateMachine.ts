/**
 * Conversation State Machine
 * Defines all valid states and transition rules for a voice ordering session.
 * Prevents invalid state transitions at the type level.
 */

import { ConversationState } from '../types';
import { AppError, ErrorCode } from '../utils/errors';
import { createServiceLogger } from '../utils/logger';

const log = createServiceLogger('StateMachine');

// ── Valid transitions map ─────────────────────────────────────────────────────
//  Key:   current state
//  Value: allowed next states
const TRANSITIONS: Record<ConversationState, ConversationState[]> = {
    IDLE: ['GREETING', 'ERROR'],
    GREETING: ['COLLECTING_ORDER', 'ERROR'],
    COLLECTING_ORDER: ['COLLECTING_ORDER', 'CLARIFYING', 'UPSELLING', 'CONFIRMING', 'ERROR'],
    CLARIFYING: ['COLLECTING_ORDER', 'CLARIFYING', 'CONFIRMING', 'ERROR'],
    UPSELLING: ['COLLECTING_ORDER', 'CONFIRMING', 'ERROR'],
    CONFIRMING: ['COLLECTING_ORDER', 'PROCESSING', 'COMPLETED', 'ERROR'],
    PROCESSING: ['COMPLETED', 'ERROR'],
    COMPLETED: [],    // Terminal state
    ERROR: ['GREETING', 'COMPLETED'],  // Allow retry or graceful exit
};

// ── Transition trigger events ─────────────────────────────────────────────────
export type TransitionTrigger =
    | 'call_started'
    | 'greeting_sent'
    | 'order_item_received'
    | 'clarification_needed'
    | 'clarification_resolved'
    | 'upsell_offered'
    | 'upsell_declined'
    | 'upsell_accepted'
    | 'confirm_prompted'
    | 'order_confirmed'
    | 'order_rejected'
    | 'order_processing_started'
    | 'order_sent_to_pos'
    | 'call_ended'
    | 'error_occurred'
    | 'retry';

/**
 * Checks whether a transition from `from` → `to` is allowed.
 */
export function isValidTransition(
    from: ConversationState,
    to: ConversationState
): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Perform a state transition, throwing if the transition is invalid.
 */
export function transition(
    current: ConversationState,
    next: ConversationState,
    context?: string
): ConversationState {
    if (!isValidTransition(current, next)) {
        const msg = `Invalid state transition: ${current} → ${next}${context ? ` (${context})` : ''}`;
        log.error(msg);
        throw new AppError(msg, ErrorCode.INVALID_STATE_TRANSITION, 500);
    }

    log.debug(`State transition: ${current} → ${next}`);
    return next;
}

/**
 * Returns true if the given state is a terminal (no-exit) state.
 */
export function isTerminalState(state: ConversationState): boolean {
    return TRANSITIONS[state].length === 0;
}

/**
 * Returns all allowed next states from the current state.
 */
export function getAllowedTransitions(state: ConversationState): ConversationState[] {
    return TRANSITIONS[state] ?? [];
}

/**
 * Describe a state in human-readable form for logging.
 */
export function describeState(state: ConversationState): string {
    const descriptions: Record<ConversationState, string> = {
        IDLE: 'Idle (awaiting call)',
        GREETING: 'Greeting customer',
        COLLECTING_ORDER: 'Taking order',
        CLARIFYING: 'Asking for clarification',
        UPSELLING: 'Offering upsell',
        CONFIRMING: 'Confirming order',
        PROCESSING: 'Sending to POS',
        COMPLETED: 'Order complete',
        ERROR: 'Error state',
    };
    return descriptions[state] ?? state;
}
