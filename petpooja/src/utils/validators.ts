/**
 * Input validators using Zod schemas.
 * Centralised schemas for all API request bodies.
 */

import { z } from 'zod';

// ── Menu ─────────────────────────────────────────────────────────────────────
export const createMenuItemSchema = z.object({
    name: z.string().min(1).max(200),
    name_hi: z.string().max(200).optional(),
    name_hinglish: z.string().max(200).optional(),
    aliases: z.array(z.string()).optional(),
    category: z.string().min(1),
    category_id: z.string().uuid(),
    description: z.string().max(1000).optional(),
    price: z.number().positive(),
    is_available: z.boolean().default(true),
    is_vegetarian: z.boolean().default(false),
    modifier_groups: z.array(z.any()).optional(),
    tags: z.array(z.string()).optional(),
    pos_item_id: z.string().min(1),
});

export const updateMenuItemSchema = createMenuItemSchema.partial();

// ── Orders ───────────────────────────────────────────────────────────────────
export const createOrderItemSchema = z.object({
    menu_item_id: z.string().uuid(),
    quantity: z.number().int().positive().max(50),
    modifiers: z
        .array(
            z.object({
                modifier_group_id: z.string(),
                modifier_option_id: z.string(),
            })
        )
        .optional()
        .default([]),
    special_notes: z.string().max(500).optional(),
});

export const createOrderSchema = z.object({
    restaurant_id: z.string().min(1),
    session_id: z.string().optional(),
    items: z.array(createOrderItemSchema).min(1),
    language: z.enum(['en', 'hi', 'hinglish']).default('en'),
    special_instructions: z.string().max(1000).optional(),
    customer_phone: z.string().optional(),
});

// ── Voice / Webhook ───────────────────────────────────────────────────────────
export const twilioWebhookSchema = z.object({
    CallSid: z.string(),
    From: z.string(),
    To: z.string(),
    CallStatus: z.string().optional(),
    AccountSid: z.string(),
});

export const twilioGatherSchema = z.object({
    CallSid: z.string(),
    SpeechResult: z.string().optional().default(''),
    Confidence: z.string().optional(),
    From: z.string(),
    To: z.string(),
    AccountSid: z.string(),
});

export const twilioRecordingSchema = z.object({
    CallSid: z.string(),
    RecordingUrl: z.string().url(),
    RecordingDuration: z.string().optional(),
    RecordingSid: z.string(),
    From: z.string(),
    AccountSid: z.string(),
});

// ── Pagination ────────────────────────────────────────────────────────────────
export const paginationSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type TwilioWebhookInput = z.infer<typeof twilioWebhookSchema>;
export type TwilioGatherInput = z.infer<typeof twilioGatherSchema>;
export type TwilioRecordingInput = z.infer<typeof twilioRecordingSchema>;
