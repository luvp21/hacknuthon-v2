/**
 * Upsell Rules
 * Rule definitions for the recommendation engine.
 * Rules are loaded from DB and cached. Architecture supports ML models later.
 */

import { UpsellRule } from '../types';

// ── Built-in default rules (used as fallback / seeding) ───────────────────────
export const DEFAULT_UPSELL_RULES: Omit<UpsellRule, 'id'>[] = [
    {
        trigger_category: 'Main Course',
        recommended_item_ids: [], // Filled at runtime from DB
        reason: 'Suggest bread with main course',
        priority: 10,
    },
    {
        trigger_category: 'Starters',
        recommended_item_ids: [],
        reason: 'Suggest beverage with starters',
        priority: 8,
    },
    {
        trigger_category: 'Breads',
        recommended_item_ids: [],
        reason: 'Suggest lassi or beverage with breads',
        priority: 7,
    },
    {
        trigger_category: 'Desserts',
        recommended_item_ids: [],
        reason: 'Suggest beverage with desserts',
        priority: 5,
    },
];

// ── Rule matching logic ────────────────────────────────────────────────────────
/**
 * Given the ordered item categories, find applicable upsell rules.
 * Returns rules sorted by priority (highest first).
 */
export function matchRules(
    orderedCategories: string[],
    orderedItemIds: string[],
    rules: UpsellRule[]
): UpsellRule[] {
    const matched: UpsellRule[] = [];
    const categoriesSet = new Set(orderedCategories.map((c) => c.toLowerCase()));
    const itemIdsSet = new Set(orderedItemIds);

    for (const rule of rules) {
        // Category trigger match
        if (
            rule.trigger_category &&
            categoriesSet.has(rule.trigger_category.toLowerCase())
        ) {
            matched.push(rule);
            continue;
        }

        // Item-level trigger match
        if (
            rule.trigger_item_ids?.length &&
            rule.trigger_item_ids.some((id) => itemIdsSet.has(id))
        ) {
            matched.push(rule);
        }
    }

    // Sort by priority descending
    return matched.sort((a, b) => b.priority - a.priority);
}

/**
 * Filter out already-ordered items from recommended item IDs.
 */
export function filterAlreadyOrdered(
    recommendedIds: string[],
    orderedIds: string[]
): string[] {
    const ordered = new Set(orderedIds);
    return recommendedIds.filter((id) => !ordered.has(id));
}
