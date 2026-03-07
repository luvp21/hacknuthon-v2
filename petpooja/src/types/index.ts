/**
 * Central Type Definitions
 * All shared interfaces, enums, and types for the AI Voice Ordering system.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Supported languages
// ─────────────────────────────────────────────────────────────────────────────
export type SupportedLanguage = 'en' | 'hi' | 'hinglish';

// ─────────────────────────────────────────────────────────────────────────────
//  Intent types (output by the Brain's intent classifier)
// ─────────────────────────────────────────────────────────────────────────────
export type IntentType =
    | 'ORDER_ADD'
    | 'ORDER_MODIFY'
    | 'ORDER_REMOVE'
    | 'QUERY_MENU'
    | 'QUERY_PRICE'
    | 'QUERY_AVAILABILITY'
    | 'CLARIFY_RESPONSE'
    | 'CONFIRM_ORDER'
    | 'CANCEL_ORDER'
    | 'SMALLTALK'
    | 'UNKNOWN';

// ─────────────────────────────────────────────────────────────────────────────
//  Conversation state machine
// ─────────────────────────────────────────────────────────────────────────────
export type ConversationState =
    | 'IDLE'
    | 'GREETING'
    | 'COLLECTING_ORDER'
    | 'CLARIFYING'
    | 'UPSELLING'
    | 'CONFIRMING'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'ERROR';

export interface ConversationTransition {
    from: ConversationState;
    to: ConversationState;
    trigger: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Menu types
// ─────────────────────────────────────────────────────────────────────────────
export interface ModifierOption {
    id: string;
    name: string;
    name_hi?: string;
    price_delta: number;   // +/- from base price
    is_available: boolean;
}

export interface ModifierGroup {
    id: string;
    name: string;
    name_hi?: string;
    type: 'single' | 'multiple';
    required: boolean;
    min_selections?: number;
    max_selections?: number;
    options: ModifierOption[];
}

export interface MenuItem {
    id: string;
    restaurant_id: string;
    name: string;
    name_hi?: string;                // Hindi name
    name_hinglish?: string;          // Hinglish alias
    aliases?: string[];              // Other names customers might say
    category: string;
    category_id: string;
    description?: string;
    price: number;
    is_available: boolean;
    is_vegetarian: boolean;
    modifier_groups?: ModifierGroup[];
    tags?: string[];                 // e.g. ['spicy', 'bestseller']
    image_url?: string;
    pos_item_id: string;             // ID in the POS system
    created_at: Date;
    updated_at: Date;
}

export interface MenuCategory {
    id: string;
    restaurant_id: string;
    name: string;
    name_hi?: string;
    sort_order: number;
    is_available: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Order types
// ─────────────────────────────────────────────────────────────────────────────
export type OrderStatus =
    | 'collecting'
    | 'pending_confirmation'
    | 'confirmed'
    | 'in_kitchen'
    | 'completed'
    | 'sent_to_pos'
    | 'pos_accepted'
    | 'pos_rejected'
    | 'cancelled'
    | 'error';

export interface SelectedModifier {
    modifier_group_id: string;
    modifier_group_name: string;
    modifier_option_id: string;
    modifier_option_name: string;
    price_delta: number;
}

export interface OrderItem {
    id: string;
    menu_item_id: string;
    menu_item_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    modifiers: SelectedModifier[];
    special_notes?: string;
}

export interface Order {
    id: string;
    session_id: string;
    restaurant_id: string;
    items: OrderItem[];
    status: OrderStatus;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    language: SupportedLanguage;
    customer_phone?: string;
    special_instructions?: string;
    pos_order_id?: string;
    kot_number?: string;
    created_at: Date;
    updated_at: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Call session
// ─────────────────────────────────────────────────────────────────────────────
export interface CallSession {
    id: string;
    call_sid: string;               // Twilio call SID
    phone_number: string;
    restaurant_id: string;
    state: ConversationState;
    language: SupportedLanguage;
    conversation_history: ConversationMessage[];
    partial_order: Partial<Order>;
    upsell_offered: boolean;
    upsell_accepted: boolean;
    upsell_shown: string[];          // Item IDs already suggested to this caller
    customer_name: string | null;    // Extracted from conversation
    retry_count: number;
    created_at: Date;
    updated_at: Date;
}

export interface ConversationMessage {
    role: 'assistant' | 'user';
    content: string;
    timestamp: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
//  LLM types
// ─────────────────────────────────────────────────────────────────────────────
export interface ExtractedItem {
    name_mentioned: string;          // Exact text customer said
    matched_item_id: string | null;  // Resolved menu item ID
    matched_item_name: string | null;
    quantity: number;
    modifiers_mentioned: string[];
    confidence: number;              // 0-1
}

export interface LLMOrderExtractionResult {
    intent: IntentType;                  // Detected customer intent
    items: ExtractedItem[];
    query_text: string | null;           // For QUERY_* intents — the question to answer
    customer_name: string | null;        // Extracted if customer introduces themselves
    language_detected: SupportedLanguage;
    confidence: number;
    needs_clarification: boolean;
    clarification_question: string | null;
    unrecognized_items: string[];
    raw_text: string;
}

export interface LLMUpsellResult {
    suggestion_text: string;
    suggested_items: string[];
    suggested_item_ids: string[];
}

export interface LLMConfirmationResult {
    confirmation_text: string;
    order_summary: string;
}

export interface LLMClarificationResult {
    clarification_text: string;
    options_offered: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  STT types
// ─────────────────────────────────────────────────────────────────────────────
export interface STTResult {
    transcript: string;
    confidence: number;
    language_detected?: string;
    words?: STTWord[];
    duration_ms?: number;
}

export interface STTWord {
    word: string;
    start_time: number;
    end_time: number;
    confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  POS integration
// ─────────────────────────────────────────────────────────────────────────────
export interface POSLineItem {
    pos_item_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    modifiers: POSModifier[];
    notes?: string;
}

export interface POSModifier {
    pos_modifier_id: string;
    name: string;
    price: number;
}

export interface POSOrderPayload {
    external_order_id: string;       // Our order UUID
    restaurant_id: string;
    source: 'voice_ai';
    channel: 'voice';                // Arch spec: always 'voice'
    customer_name: string | null;
    customer_phone?: string;
    items: POSLineItem[];
    total_amount: number;
    special_instructions?: string;
    upsell_accepted_ids: string[];   // Item IDs accepted via upsell
    metadata?: Record<string, unknown>;
}

export interface POSResponse {
    success: boolean;
    pos_order_id?: string;
    kot_number?: string;
    estimated_time_minutes?: number;
    error_code?: string;
    error_message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Upsell types
// ─────────────────────────────────────────────────────────────────────────────
export interface UpsellRule {
    id: string;
    trigger_category?: string;
    trigger_item_ids?: string[];
    recommended_item_ids: string[];
    reason: string;
    priority: number;               // higher = higher priority
}

export interface UpsellSuggestion {
    items: MenuItem[];
    message: string;
    rule_id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Revenue Intelligence Engine types
// ─────────────────────────────────────────────────────────────────────────────
export type BCGQuadrant = 'Star' | 'Hidden Star' | 'Risk' | 'Dog';

export interface RevenueScore {
    item_id: string;
    restaurant_id: string;
    margin_score: number;        // selling_price - food_cost
    margin_pct: number;          // margin as % of selling price
    popularity_score: number;    // 0-100 normalised from last 30 days
    quadrant: BCGQuadrant;
    upsell_priority: number;     // 0-1 float — higher = show first
    top_combos: ComboSuggestion[];
    last_computed: Date;
}

export interface ComboSuggestion {
    item_id: string;
    item_name: string;
    confidence: number;
}

export interface ComboRule {
    id: string;
    restaurant_id: string;
    item_a: string;
    item_b: string;
    co_occurrence_count: number;
    confidence: number;
    lift: number;
    last_updated: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
//  API request / response shapes
// ─────────────────────────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    total: number;
    page: number;
    limit: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Queue job payloads
// ─────────────────────────────────────────────────────────────────────────────
export interface OrderJobPayload {
    order_id: string;
    session_id: string;
    restaurant_id: string;
    retry_count?: number;
}

export interface POSJobPayload {
    order_id: string;
    restaurant_id: string;
    attempt_number: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Database row types (raw from pg)
// ─────────────────────────────────────────────────────────────────────────────
export interface DBMenuItem {
    id: string;
    restaurant_id: string;
    name: string;
    name_hi: string | null;
    name_hinglish: string | null;
    aliases: string[] | null;
    category: string;
    category_id: string;
    description: string | null;
    price: string;                  // pg returns NUMERIC as string
    is_available: boolean;
    is_vegetarian: boolean;
    modifier_groups: ModifierGroup[] | null;
    tags: string[] | null;
    image_url: string | null;
    pos_item_id: string;
    created_at: Date;
    updated_at: Date;
}

export interface DBOrder {
    id: string;
    session_id: string;
    restaurant_id: string;
    items: OrderItem[];
    status: OrderStatus;
    subtotal: string;
    tax_amount: string;
    total_amount: string;
    language: SupportedLanguage;
    customer_phone: string | null;
    special_instructions: string | null;
    pos_order_id: string | null;
    kot_number: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface DBCallSession {
    id: string;
    call_sid: string;
    phone_number: string;
    restaurant_id: string;
    state: ConversationState;
    language: SupportedLanguage;
    conversation_history: ConversationMessage[];
    partial_order: Partial<Order> | null;
    upsell_offered: boolean;
    upsell_accepted: boolean;
    upsell_shown: string[];
    customer_name: string | null;
    retry_count: number;
    created_at: Date;
    updated_at: Date;
}
