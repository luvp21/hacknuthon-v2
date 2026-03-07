/**
 * Order Parser
 * Transforms raw LLM extraction output into validated OrderItem objects.
 * Handles quantity merging, modifier resolution, and price calculation.
 */

import { v4 as uuidv4 } from 'uuid';
import {
    ExtractedItem,
    MenuItem,
    OrderItem,
    SelectedModifier,
} from '../types';
import { resolveModifiers, applyDefaultModifiers, calculateModifiersDelta } from './modifierHandler';
import { createServiceLogger } from '../utils/logger';
import { roundTo, toNumber } from '../utils/helpers';

const log = createServiceLogger('OrderParser');

export class OrderParser {
    /**
     * Convert LLM-extracted items into fully resolved OrderItem objects.
     * Skips items with no matched menu item ID.
     */
    async parseExtractedItems(
        extractedItems: ExtractedItem[],
        menuItems: MenuItem[]
    ): Promise<OrderItem[]> {
        const menuMap = new Map(menuItems.map((m) => [m.id, m]));
        const orderItems: OrderItem[] = [];

        for (const extracted of extractedItems) {
            if (!extracted.matched_item_id) {
                log.debug('Skipping unmatched item', { name: extracted.name_mentioned });
                continue;
            }

            const menuItem = menuMap.get(extracted.matched_item_id);
            if (!menuItem) {
                log.warn('Matched item ID not found in menu map', {
                    id: extracted.matched_item_id,
                });
                continue;
            }

            if (!menuItem.is_available) {
                log.info('Menu item unavailable, skipping', { name: menuItem.name });
                continue;
            }

            const basePrice = toNumber(menuItem.price);
            const quantity = Math.max(1, Math.min(50, extracted.quantity)); // Clamp 1-50

            // Resolve spoken modifiers to SelectedModifier objects
            let modifiers: SelectedModifier[] = resolveModifiers(
                extracted.modifiers_mentioned,
                menuItem.modifier_groups ?? []
            );

            // Apply defaults for required groups
            modifiers = applyDefaultModifiers(modifiers, menuItem.modifier_groups ?? []);

            const modifierDelta = calculateModifiersDelta(modifiers);
            const unitPrice = roundTo(basePrice + modifierDelta);
            const totalPrice = roundTo(unitPrice * quantity);

            orderItems.push({
                id: uuidv4(),
                menu_item_id: menuItem.id,
                menu_item_name: menuItem.name,
                quantity,
                unit_price: unitPrice,
                total_price: totalPrice,
                modifiers,
            });
        }

        log.debug('Order parsed', { inputCount: extractedItems.length, outputCount: orderItems.length });
        return orderItems;
    }

    /**
     * Merge new items into an existing order item list.
     * If an item with the same menu_item_id and identical modifiers already exists,
     * increment its quantity instead of adding a duplicate.
     */
    mergeItems(existing: OrderItem[], newItems: OrderItem[]): OrderItem[] {
        const result = [...existing];

        for (const newItem of newItems) {
            const matchIndex = result.findIndex(
                (e) =>
                    e.menu_item_id === newItem.menu_item_id &&
                    this.modifiersEqual(e.modifiers, newItem.modifiers)
            );

            if (matchIndex >= 0) {
                const existingItem = result[matchIndex];
                const combinedQty = existingItem.quantity + newItem.quantity;
                result[matchIndex] = {
                    ...existingItem,
                    quantity: combinedQty,
                    total_price: roundTo(existingItem.unit_price * combinedQty),
                };
                log.debug('Incremented item quantity', {
                    name: newItem.menu_item_name,
                    quantity: combinedQty,
                });
            } else {
                result.push(newItem);
            }
        }

        return result;
    }

    /**
     * Compute order totals (subtotal, tax, total).
     */
    calculateTotals(
        items: OrderItem[],
        taxRatePercent = 5
    ): { subtotal: number; tax_amount: number; total_amount: number } {
        const subtotal = roundTo(
            items.reduce((sum, item) => sum + item.total_price, 0)
        );
        const tax_amount = roundTo((subtotal * taxRatePercent) / 100);
        const total_amount = roundTo(subtotal + tax_amount);

        return { subtotal, tax_amount, total_amount };
    }

    /**
     * Remove a specific item from the order by its ID.
     */
    removeItem(items: OrderItem[], itemId: string): OrderItem[] {
        return items.filter((i) => i.id !== itemId);
    }

    /**
     * Update the quantity of an item, removing it if quantity reaches 0.
     */
    updateQuantity(
        items: OrderItem[],
        itemId: string,
        newQuantity: number
    ): OrderItem[] {
        if (newQuantity <= 0) return this.removeItem(items, itemId);

        return items.map((item) => {
            if (item.id !== itemId) return item;
            return {
                ...item,
                quantity: newQuantity,
                total_price: roundTo(item.unit_price * newQuantity),
            };
        });
    }

    // ── Private ──────────────────────────────────────────────────────────────
    private modifiersEqual(
        a: SelectedModifier[],
        b: SelectedModifier[]
    ): boolean {
        if (a.length !== b.length) return false;
        const aIds = a.map((m) => m.modifier_option_id).sort().join(',');
        const bIds = b.map((m) => m.modifier_option_id).sort().join(',');
        return aIds === bIds;
    }
}
