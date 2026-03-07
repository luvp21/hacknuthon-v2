/**
 * Prompt Templates
 * All LLM prompts live here — centralised, versioned, and easy to tune.
 * Every prompt returns structured JSON to avoid hallucination.
 */

import { MenuItem, SupportedLanguage, OrderItem, IntentType } from '../types';
import type { SessionContext, CartItem } from '../conversation/sessionStore';

// ── Helpers ───────────────────────────────────────────────────────────────────
function menuToPromptContext(items: MenuItem[]): string {
    return items
        .filter((i) => i.is_available)
        .map(
            (i) =>
                `- id: ${i.id} | name: "${i.name}"` +
                (i.name_hi ? ` / "${i.name_hi}"` : '') +
                (i.name_hinglish ? ` / "${i.name_hinglish}"` : '') +
                (i.aliases?.length ? ` (also: ${i.aliases.join(', ')})` : '') +
                ` | price: ₹${i.price} | category: ${i.category}` +
                (i.modifier_groups?.length
                    ? ` | modifiers: ${i.modifier_groups.map((g) => g.name).join(', ')}`
                    : '')
        )
        .join('\n');
}

function languageInstruction(lang: SupportedLanguage): string {
    switch (lang) {
        case 'hi':
            return 'Respond in Hindi (Devanagari script).';
        case 'hinglish':
            return 'Respond in Hinglish (informal mix of Hindi and English, Roman script).';
        default:
            return 'Respond in English.';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. SYSTEM CONTEXT PROMPT
//     Injected as the system message in every conversation.
// ─────────────────────────────────────────────────────────────────────────────
export function buildSystemPrompt(
    restaurantName: string,
    menuItems: MenuItem[]
): string {
    return `You are an AI voice ordering assistant for ${restaurantName}.
Your job is to take food orders over the phone naturally, accurately, and efficiently.

AVAILABLE MENU (these are the ONLY items you can accept):
${menuToPromptContext(menuItems)}

RULES:
1. ONLY accept items from the menu above. Do NOT invent or suggest items not listed.
2. Always output valid JSON — never plain text in responses.
3. If an item is ambiguous, ask for clarification before adding it.
4. Be concise — customers are on a phone call.
5. Handle all three languages: English, Hindi, Hinglish.
6. Quantities default to 1 if not stated.
7. Never guess a menu item ID — only use IDs from the list above.`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  2. ORDER EXTRACTION PROMPT
//     Extracts structured order items from customer speech.
// ─────────────────────────────────────────────────────────────────────────────
export function buildOrderExtractionPrompt(
    transcript: string,
    menuItems: MenuItem[],
    language: SupportedLanguage
): string {
    return `
${languageInstruction(language)}

The customer said: "${transcript}"

MENU CONTEXT:
${menuToPromptContext(menuItems)}

First, classify the customer's INTENT, then extract all relevant data.

INTENT must be exactly one of:
  ORDER_ADD         – customer wants to add items to their order
  ORDER_MODIFY      – customer wants to change quantity/modifiers of an existing item, OR a compound "remove X and add Y" operation
  ORDER_REMOVE      – customer wants to remove an item (with NO new items to add)
  QUERY_MENU        – customer is asking about the menu (e.g. "what do you have?")
  QUERY_PRICE       – customer is asking about price
  QUERY_AVAILABILITY – customer is asking if something is available
  CLARIFY_RESPONSE  – customer is answering/clarifying a previous question
  CONFIRM_ORDER     – customer is confirming their order (yes/haan/confirm/theek)
  CANCEL_ORDER      – customer wants to cancel or start over
  SMALLTALK         – casual chat not related to ordering
  UNKNOWN           – cannot determine intent

COMPOUND OPERATIONS ("remove X and add Y" / "swap X for Y" / "instead of X give me Y"):
  → Use intent ORDER_MODIFY and include ALL affected items in the items array.
  → Set quantity: 0 for any item the customer wants REMOVED from the order.
  → Set quantity: N (≥1) for any item the customer wants ADDED or UPDATED.

You MUST respond with ONLY a valid JSON object — no other text, no markdown.

Required JSON schema:
{
  "intent": "<one of the INTENT values above>",
  "items": [
    {
      "name_mentioned": "<exact words customer used>",
      "matched_item_id": "<menu item id or null>",
      "matched_item_name": "<canonical menu item name or null>",
      "quantity": <integer, default 1>,
      "modifiers_mentioned": ["<modifier strings>"],
      "confidence": <float 0.0-1.0>
    }
  ],
  "query_text": "<the natural-language question for QUERY_* intents, or null>",
  "customer_name": "<customer's name if they introduced themselves, or null>",
  "language_detected": "en" | "hi" | "hinglish",
  "needs_clarification": <boolean>,
  "clarification_question": "<question to ask customer, or null>",
  "unrecognized_items": ["<items that don't match any menu item>"],
  "raw_text": "${transcript}"
}

Matching rules:
- Match "paneer tikka" → id "a0000000-0000-0000-0000-000000000001"
- Match "paneer टिक्का", "panner tikka" as the same item
- If customer says "do naan" → quantity: 2, name: "Butter Naan"
- If customer says "spicy paneer tikka" → add "spicy" to modifiers_mentioned
- If confidence < 0.6, set needs_clarification = true
- For ORDER_REMOVE: still extract items (what they want removed)
- For QUERY_* intents: items array should be empty, put the question in query_text
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  3. UPSELL RECOMMENDATION PROMPT
//     Generates a natural upsell suggestion.
// ─────────────────────────────────────────────────────────────────────────────
export function buildUpsellPrompt(
    currentItems: OrderItem[],
    suggestedItems: MenuItem[],
    language: SupportedLanguage
): string {
    const orderSummary = currentItems
        .map((i) => `${i.quantity}x ${i.menu_item_name}`)
        .join(', ');

    const suggestions = suggestedItems
        .map((i) => `- ${i.name} (₹${i.price})`)
        .join('\n');

    return `
${languageInstruction(language)}

Customer's current order: ${orderSummary}

You can suggest these add-ons:
${suggestions}

Generate a friendly, natural, non-pushy upsell suggestion for a phone call.
Keep it to ONE sentence. Do not be overly salesy.

Respond with ONLY valid JSON — no other text:
{
  "suggestion_text": "<the upsell message to speak to the customer>",
  "suggested_items": ["<item name>"],
  "suggested_item_ids": ["<item id>"]
}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  4. ORDER CONFIRMATION PROMPT
//     Generates the order readback before final confirmation.
// ─────────────────────────────────────────────────────────────────────────────
export function buildConfirmationPrompt(
    items: OrderItem[],
    totalAmount: number,
    language: SupportedLanguage
): string {
    const itemLines = items
        .map(
            (i) =>
                `${i.quantity}x ${i.menu_item_name}` +
                (i.modifiers.length
                    ? ` (${i.modifiers.map((m) => m.modifier_option_name).join(', ')})`
                    : '') +
                ` — ₹${i.total_price}`
        )
        .join('\n');

    return `
${languageInstruction(language)}

The customer's order is:
${itemLines}

Total: ₹${totalAmount}

Generate a clear, natural order confirmation readback for a phone call.
End with asking if they want to confirm or change anything.
Keep it brief and conversational.

Respond with ONLY valid JSON:
{
  "confirmation_text": "<the full message to speak to the customer>",
  "order_summary": "<concise one-line summary>"
}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. CLARIFICATION PROMPT
//     Asks customer to clarify an ambiguous item.
// ─────────────────────────────────────────────────────────────────────────────
export function buildClarificationPrompt(
    ambiguousText: string,
    candidates: MenuItem[],
    language: SupportedLanguage
): string {
    const options = candidates.map((c) => `- ${c.name} (₹${c.price})`).join('\n');

    return `
${languageInstruction(language)}

Customer said: "${ambiguousText}"

This could match these menu items:
${options}

Generate a short, friendly clarification question to ask the customer on the phone.
Offer numbered options if there are 2-3 choices.

Respond with ONLY valid JSON:
{
  "clarification_text": "<the question to speak>",
  "options_offered": ["<option 1>", "<option 2>"]
}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  6. GREETING PROMPT
//     Generates a language-appropriate greeting.
// ─────────────────────────────────────────────────────────────────────────────
export function buildGreetingPrompt(
    restaurantName: string,
    language: SupportedLanguage
): string {
    return `
${languageInstruction(language)}

Generate a warm, brief phone greeting for ${restaurantName}.
Structure it as two parts in one natural sentence flow:
1. Welcome them to ${restaurantName} and introduce yourself as an AI ordering assistant.
2. Ask for their name (e.g. "May I have your name please?").
Do NOT ask what they want to order yet — name comes first.
Keep it to 2 sentences max.

Respond with ONLY valid JSON:
{
  "greeting_text": "<the greeting to speak>"
}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  7. ERROR / RETRY PROMPT
//     Used when STT confidence is too low.
// ─────────────────────────────────────────────────────────────────────────────
export function buildRetryPrompt(
    language: SupportedLanguage,
    attemptNumber: number
): string {
    return `
${languageInstruction(language)}

The speech recognition could not understand the customer clearly.
This is attempt ${attemptNumber}. Generate a polite message asking them to repeat.

Respond with ONLY valid JSON:
{
  "retry_text": "<the polite retry message>"
}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  8. ORDER COMPLETE / GOODBYE PROMPT
// ─────────────────────────────────────────────────────────────────────────────
export function buildGoodbyePrompt(
    kotNumber: string | undefined,
    language: SupportedLanguage
): string {
    const kotInfo = kotNumber ? `Your KOT number is ${kotNumber}.` : '';

    return `
${languageInstruction(language)}

The order has been successfully placed. ${kotInfo}
Generate a warm goodbye message for the customer.

Respond with ONLY valid JSON:
{
  "goodbye_text": "<the goodbye message>"
}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  9. QUERY RESPONSE PROMPT
//     Converts NL→SQL results into a natural spoken response.
// ─────────────────────────────────────────────────────────────────────────────
export function buildQueryResponsePrompt(
    queryText: string,
    sqlResultText: string,
    language: SupportedLanguage
): string {
    return `
${languageInstruction(language)}

A customer asked: "${queryText}"

The database returned these results:
${sqlResultText || 'No results found.'}

Generate a concise, natural, spoken response answering the customer's question.
- Keep it to 2-3 sentences max — they are on a phone call.
- If there are many items, mention the top 3-4 and say "and more".
- If no results, apologise briefly and offer to help differently.
- End with "Is there anything you'd like to order?" or equivalent.

Respond with ONLY valid JSON:
{
  "response_text": "<the spoken answer>"
}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  10. SMALLTALK DEFLECTION PROMPT
//      Politely redirects casual chat back to ordering.
// ─────────────────────────────────────────────────────────────────────────────
export function buildSmallTalkPrompt(
    transcript: string,
    restaurantName: string,
    language: SupportedLanguage
): string {
    return `
${languageInstruction(language)}

A customer said: "${transcript}"
This is casual chat, not an order request.

Generate a short, friendly response for ${restaurantName}'s AI ordering assistant.
Be warm and natural, then gently redirect to ordering.
Keep it to 1-2 sentences.

Respond with ONLY valid JSON:
{
  "response_text": "<the response to speak>"
}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  11. BRAIN SYSTEM PROMPT
//      Persistent system message injected into every Brain LLM context window.
//      Concise enough to fit with chat history without burning tokens.
// ─────────────────────────────────────────────────────────────────────────────
export function buildBrainSystemPrompt(
    restaurantName: string,
    menuSummary: string
): string {
    return `You are an AI phone-ordering assistant for ${restaurantName}.
Take food orders naturally and efficiently. Never invent menu items.

MENU (available items only):
${menuSummary}

RULES:
- Accept only items from the menu above.
- Always respond in the customer's language (en / hi / hinglish).
- Be concise — the customer is on a phone call.
- If anything is ambiguous, ask ONE short clarifying question.`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  12. INTENT EXTRACTION PROMPT  (Brain fast-path)
//      Used by Brain to classify intent and extract entities in one call.
//      Returns a compact JSON — smaller than buildOrderExtractionPrompt.
// ─────────────────────────────────────────────────────────────────────────────
export function buildIntentExtractionPrompt(
    transcript: string,
    history: { role: string; content: string }[],
    language: string
): string {
    const historyBlock = history.length
        ? history
            .slice(-6)
            .map((m) => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.content}`)
            .join('\n')
        : '(start of conversation)';

    return `
CRITICAL: Return ONLY a raw JSON object. NO markdown fences, NO \`\`\`json, NO explanation text outside the JSON.

Language hint: ${language}

Recent conversation:
${historyBlock}

Customer just said: "${transcript}"

Classify the intent and extract entities.

Intent must be exactly one of:
  ORDER_ADD | ORDER_MODIFY | ORDER_REMOVE
  QUERY_MENU | QUERY_PRICE | QUERY_AVAILABILITY | QUERY_ORDER
  CLARIFY_RESPONSE | CONFIRM_ORDER | CANCEL_ORDER
  SMALLTALK | UNKNOWN

Intent meanings (choose carefully):
  ORDER_ADD          – customer wants to add a new item to their cart
  ORDER_MODIFY       – customer wants to change qty or modifier of an existing cart item
  ORDER_REMOVE       – customer wants to remove an item from the cart
  QUERY_MENU         – asking what dishes/items are available on the menu
  QUERY_PRICE        – asking the price of a specific item
  QUERY_AVAILABILITY – asking if a specific item is available today
  QUERY_ORDER        – asking what is currently in their cart / what they have ordered / total bill so far ("repeat my order", "what's in my cart?", "what's my total?")
  CLARIFY_RESPONSE   – responding to a clarification question from the assistant
  CONFIRM_ORDER      – explicitly asking to place / confirm / finalise the order ("yes confirm it", "place my order")
  CANCEL_ORDER       – wanting to cancel and clear the entire cart
  SMALLTALK          – ONLY pure social conversation with ZERO ordering component (e.g. "how are you", "hello there", "nice day"). ANY statement that expresses a desire for food, items, or service is NOT smalltalk — classify it as ORDER_ADD or QUERY_MENU instead. "I want something", "give me something", "suggest me something", "I'd like to try something" are ALL ORDER_ADD or QUERY_MENU, never SMALLTALK.
  UNKNOWN            – none of the above

Respond with ONLY valid JSON — absolutely no markdown, no extra text:
{
  "intent": "<intent>",
  "entities": {
    "item_name": "<item the customer mentioned, or null>",
    "qty": <integer or null>,
    "modifier": "<modifier string or null>",
    "query_subject": "<what they are asking about, or null>"
  },
  "confidence": <float 0-1>,
  "language": "<en|hi|hinglish>"
}`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  13. RESPONSE GENERATION PROMPT  (Brain response layer)
//      Generates the final spoken response after intent routing is complete.
//      Max 2 short sentences — optimised for natural TTS output.
// ─────────────────────────────────────────────────────────────────────────────
export function buildResponseGenerationPrompt(
    intent: string,
    context: {
        cart: { itemName: string; quantity: number; price: number }[];
        cartTotal: number;
        state: string;
        language: string;
    },
    queryResult: string | null,
    upsellLine: string | null,
    language: string
): string {
    const cartSummary = context.cart.length
        ? context.cart.map((i) => `${i.quantity}x ${i.itemName} ₹${i.price}`).join(', ')
        : 'empty';

    return `
Language: ${language}
Intent handled: ${intent}
Current cart: ${cartSummary} | Total: ₹${context.cartTotal}
${queryResult ? `Query result: ${queryResult}` : ''}
${upsellLine ? `Upsell to weave in: ${upsellLine}` : ''}

Generate the assistant's spoken response.
- Max 2 short sentences — customer is on a phone call.
- If upsell is provided, weave it in naturally at the end.
- Match the customer's language (${language}).

Respond with ONLY valid JSON:
{
  "response_text": "<the spoken response>"
}`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  BRAIN V3 PROMPTS
//  Used by the new Brain state machine (brainService v3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dynamic per-session system prompt for the Brain v3 state machine.
 * Injected as the first system message in every LLM context window.
 */
export function BRAIN_SYSTEM_PROMPT(session: SessionContext): string {
    const lang = session.language || 'en'
    const customerName = session.customer?.customerName ?? null
    const segment = session.customer?.segment ?? 'NEW'
    const visitCount = session.customer?.visitCount ?? 0

    const langInstruction =
        lang === 'hi'
            ? 'Respond in Hindi (Devanagari script).'
            : lang === 'hinglish'
                ? 'Respond in Hinglish (casual mix of Hindi and English, Roman script).'
                : 'Respond in English.'

    const customerContext = customerName
        ? `Customer: ${customerName} (${segment}, ${visitCount} visit${visitCount !== 1 ? 's' : ''}).`
        : 'Customer: first-time caller (not yet identified).'

    const cartLines = session.cart.length
        ? session.cart
            .map((i: CartItem) => `  - ${i.qty}x ${i.name} ₹${i.lineTotal.toFixed(0)}`)
            .join('\n')
        : '  (empty)'

    return `You are an AI phone-ordering assistant for Tadka & Twist restaurant.
Take food orders naturally, efficiently, and in the customer's language.
Never invent menu items. Only accept items confirmed available in RAG context.

${langInstruction}
${customerContext}

Current cart:
${cartLines}
Cart total: ₹${session.cartTotal.toFixed(0)}
${session.appliedDiscount > 0 ? `Discount applied: -₹${session.appliedDiscount.toFixed(0)} → Net: ₹${session.netTotal.toFixed(0)}` : ''}

STATE: ${session.state}

RULES:
- Be concise — max 1-2 sentences. Customer is on a phone call.
- Always respond in the detected language (${lang}).
- Never mention "JSON" or technical terms to the customer.
- If cart is non-empty and customer seems done, offer to confirm.`.trim()
}

/**
 * Cart summary formatted for human-readable confirmation.
 */
export function buildCartSummary(
    cart: CartItem[],
    total: number,
    discount: number,
    netTotal: number,
    language: string
): string {
    if (cart.length === 0) {
        if (language === 'hi') return 'आपकी टोकरी खाली है।'
        if (language === 'hinglish') return 'Aapki cart abhi empty hai.'
        return 'Your cart is empty.'
    }

    const lines = cart.map((item: CartItem) => {
        const modLine =
            item.modifiers.length > 0
                ? ` (${item.modifiers.map((m) => m.label).join(', ')})`
                : ''
        const noteLine = item.notes ? ` [Note: ${item.notes}]` : ''
        return `${item.qty}x ${item.name}${modLine}${noteLine} — ₹${item.lineTotal.toFixed(0)}`
    })

    const summaryLines = [...lines, `Subtotal: ₹${total.toFixed(0)}`]
    if (discount > 0) {
        summaryLines.push(`Discount: -₹${discount.toFixed(0)}`)
        summaryLines.push(`Total: ₹${netTotal.toFixed(0)}`)
    }

    return summaryLines.join('\n')
}

/**
 * Per-intent turn prompt for Brain v3.
 * Tells the LLM exactly what JSON schema to return based on the
 * detected intent, plus injects RAG context as grounding.
 */
export function buildTurnPrompt(
    intent: string,
    transcript: string,
    session: SessionContext,
    ragContext: string,
    entities: { item_name?: string | null; qty?: number | null; modifier?: string | null; query_subject?: string | null }
): string {
    const lang = session.language || 'en'
    const cartSummary = buildCartSummary(
        session.cart,
        session.cartTotal,
        session.appliedDiscount,
        session.netTotal,
        lang
    )

    const baseContext = `
Language: ${lang}
Current cart (AUTHORITATIVE — always trust this, never say "cart is empty" if items are listed here):
${cartSummary}

RAG context (use for menu/price/availability questions only):
${ragContext || '(no RAG context loaded)'}

Customer said: "${transcript}"
Detected intent: ${intent}
Extracted entities: ${JSON.stringify(entities)}
`.trim()

    switch (intent) {
        case 'ORDER_ADD':
            return `${baseContext}

The customer wants to add an item to their order.
Look up the item in the RAG context above. Item 20 is NEVER available — ignore any request for it.

Respond with ONLY valid JSON:
{
  "itemFound": <boolean>,
  "itemId": <number | null>,
  "itemName": <string | null>,
  "unitPrice": <number>,
  "foodCost": <number>,
  "qty": <number>,
  "modifiers": [{"type": <string>, "label": <string>, "priceDelta": <number>}],
  "modifierDelta": <number>,
  "notes": "<any special instruction the customer mentioned for this item, e.g. 'extra spicy', 'no onion', 'less oil', or null if none>",
  "responseText": "<spoken confirmation or clarification question in ${lang}>",
  "suggestions": ["<if item not found, list 1-2 similar items available>"]
}`

        case 'ORDER_REMOVE': {
            const cartWithIds = session.cart.length
                ? session.cart
                    .map((i: CartItem) => `  - itemId: ${i.itemId} | ${i.qty}x ${i.name} — ₹${i.lineTotal.toFixed(0)}`)
                    .join('\n')
                : '  (empty)'
            return `${baseContext}

CART ITEMS WITH IDs (you MUST use these exact numeric itemIds in your response):
${cartWithIds}

The customer wants to remove an item from their cart. Look at the CART ITEMS WITH IDs above to find the correct itemId.

Respond with ONLY valid JSON:
{
  "itemId": <exact numeric itemId from the cart list above | null>,
  "itemName": <string | null>,
  "responseText": "<spoken confirmation that item was removed, in ${lang}>"
}`
        }

        case 'ORDER_MODIFY': {
            const cartWithIds = session.cart.length
                ? session.cart
                    .map((i: CartItem) => `  - itemId: ${i.itemId} | ${i.qty}x ${i.name} — ₹${i.lineTotal.toFixed(0)}`)
                    .join('\n')
                : '  (empty)'
            return `${baseContext}

CART ITEMS WITH IDs (you MUST use these exact numeric itemIds in your response):
${cartWithIds}

The customer wants to modify quantity or modifiers of a cart item. Look at the CART ITEMS WITH IDs above to find the correct itemId.

Respond with ONLY valid JSON:
{
  "itemId": <exact numeric itemId from the cart list above | null>,
  "itemName": <string | null>,
  "modifications": {
    "newQty": <number | null>,
    "newModifiers": [{"type": <string>, "label": <string>, "priceDelta": <number>}] | null
  },
  "responseText": "<spoken confirmation in ${lang}>"
}`
        }

        case 'QUERY_MENU':
        case 'QUERY_PRICE':
        case 'QUERY_AVAILABILITY':
            return `${baseContext}

The customer has a question about the menu. Answer using the RAG context above.
If the question is about their cart or total, use the "Current cart" section above instead.
Keep it to 2 sentences max — they are on a phone call.
End by inviting them to order.

Respond with just the plain spoken answer (no JSON needed — return a single string).`

        case 'SMALLTALK':
            return `${baseContext}

The customer is making small talk. Be warm, brief, and redirect gently to ordering.
1-2 sentences max.

Respond with just the spoken response text (no JSON).`

        default:
            // UNKNOWN / CLARIFY_RESPONSE
            return `${baseContext}

Respond helpfully to the customer's message. If you cannot understand, ask them to repeat.
1-2 sentences max. Respond in ${lang}.

Respond with just the spoken response text (no JSON).`
    }
}
