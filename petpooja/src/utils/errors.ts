/**
 * Custom Application Errors
 * Typed error hierarchy for clean error handling across all layers.
 */

export enum ErrorCode {
    // Generic
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    NOT_FOUND = 'NOT_FOUND',
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',
    RATE_LIMITED = 'RATE_LIMITED',

    // Voice / STT
    STT_FAILED = 'STT_FAILED',
    STT_LOW_CONFIDENCE = 'STT_LOW_CONFIDENCE',
    AUDIO_UNAVAILABLE = 'AUDIO_UNAVAILABLE',

    // Conversation
    SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
    INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
    MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',

    // Menu
    MENU_ITEM_NOT_FOUND = 'MENU_ITEM_NOT_FOUND',
    MENU_ITEM_UNAVAILABLE = 'MENU_ITEM_UNAVAILABLE',
    AMBIGUOUS_ITEM = 'AMBIGUOUS_ITEM',

    // Order
    ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
    ORDER_EMPTY = 'ORDER_EMPTY',
    ORDER_ALREADY_CONFIRMED = 'ORDER_ALREADY_CONFIRMED',
    INVALID_MODIFIER = 'INVALID_MODIFIER',

    // POS
    POS_UNAVAILABLE = 'POS_UNAVAILABLE',
    POS_REJECTED_ORDER = 'POS_REJECTED_ORDER',
    POS_AUTH_FAILED = 'POS_AUTH_FAILED',

    // LLM
    LLM_UNAVAILABLE = 'LLM_UNAVAILABLE',
    LLM_INVALID_RESPONSE = 'LLM_INVALID_RESPONSE',
}

export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly context?: Record<string, unknown>;

    constructor(
        message: string,
        code: ErrorCode = ErrorCode.INTERNAL_ERROR,
        statusCode: number = 500,
        context?: Record<string, unknown>
    ) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = true;
        this.context = context;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, ErrorCode.VALIDATION_ERROR, 400, context);
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string, id?: string) {
        super(
            `${resource}${id ? ` (${id})` : ''} not found`,
            ErrorCode.NOT_FOUND,
            404
        );
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, ErrorCode.UNAUTHORIZED, 401);
    }
}

export class SessionNotFoundError extends AppError {
    constructor(sessionId: string) {
        super(
            `Conversation session not found: ${sessionId}`,
            ErrorCode.SESSION_NOT_FOUND,
            404
        );
    }
}

export class MenuItemNotFoundError extends AppError {
    constructor(name: string) {
        super(
            `Menu item not found: "${name}"`,
            ErrorCode.MENU_ITEM_NOT_FOUND,
            404,
            { searched: name }
        );
    }
}

export class AmbiguousItemError extends AppError {
    constructor(name: string, candidates: string[]) {
        super(
            `Ambiguous menu item: "${name}" — matches: ${candidates.join(', ')}`,
            ErrorCode.AMBIGUOUS_ITEM,
            400,
            { searched: name, candidates }
        );
    }
}

export class POSError extends AppError {
    constructor(message: string, code: ErrorCode = ErrorCode.POS_UNAVAILABLE) {
        super(message, code, 502);
    }
}

export class LLMError extends AppError {
    constructor(message: string, code: ErrorCode = ErrorCode.LLM_UNAVAILABLE) {
        super(message, code, 503);
    }
}

export class STTError extends AppError {
    constructor(message: string, code: ErrorCode = ErrorCode.STT_FAILED) {
        super(message, code, 503);
    }
}

/** Narrows an unknown catch value to AppError or wraps it. */
export function toAppError(err: unknown): AppError {
    if (err instanceof AppError) return err;
    if (err instanceof Error) {
        return new AppError(err.message, ErrorCode.INTERNAL_ERROR, 500, {
            originalName: err.name,
        });
    }
    return new AppError('An unexpected error occurred', ErrorCode.INTERNAL_ERROR, 500);
}
