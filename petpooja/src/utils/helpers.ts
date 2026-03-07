/**
 * General-purpose utility helpers.
 */

import { v4 as uuidv4 } from 'uuid';

/** Generate a UUID v4 */
export const generateId = (): string => uuidv4();

/** Sleep for `ms` milliseconds */
export const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Safely parse JSON; returns null on failure instead of throwing.
 */
export function safeParseJSON<T>(text: string): T | null {
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

/**
 * Extract the first JSON object or array from a string.
 * Useful when LLM output has extra prose around the JSON.
 */
export function extractJSON<T>(text: string): T | null {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return null;
    return safeParseJSON<T>(match[0]);
}

/**
 * Clamps a number between min and max.
 */
export const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);

/**
 * Rounds a number to the given decimal places.
 */
export const roundTo = (value: number, decimals = 2): number =>
    Math.round(value * 10 ** decimals) / 10 ** decimals;

/**
 * Converts a database NUMERIC string to a JavaScript number.
 */
export const toNumber = (value: string | number): number =>
    typeof value === 'string' ? parseFloat(value) : value;

/**
 * Calculates tax amount.
 * @param subtotal - Pre-tax amount
 * @param taxRate  - Tax percentage (e.g. 5 for 5%)
 */
export const calculateTax = (subtotal: number, taxRate = 5): number =>
    roundTo((subtotal * taxRate) / 100);

/**
 * Returns the current ISO timestamp string.
 */
export const now = (): string => new Date().toISOString();

/**
 * Strips markdown code fences from LLM output.
 * Handles ```json ... ``` blocks.
 */
export function stripCodeFences(text: string): string {
    return text
        .replace(/^```(?:json|javascript|typescript)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
}

/**
 * Normalize a string for fuzzy comparison:
 * lowercase, trim, collapse whitespace.
 */
export function normalize(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Masks a phone number for safe logging: +91XXXXXX1234
 */
export function maskPhone(phone: string): string {
    if (phone.length < 4) return '****';
    return phone.slice(0, -4).replace(/\d/g, 'X') + phone.slice(-4);
}

/**
 * Creates a standardized API response envelope.
 */
export function apiResponse<T>(
    data: T,
    message?: string
): { success: true; data: T; message?: string; timestamp: string } {
    return {
        success: true,
        data,
        ...(message ? { message } : {}),
        timestamp: now(),
    };
}

/**
 * Creates a standardized API error response envelope.
 */
export function apiError(
    error: string,
    message?: string
): { success: false; error: string; message?: string; timestamp: string } {
    return {
        success: false,
        error,
        ...(message ? { message } : {}),
        timestamp: now(),
    };
}
