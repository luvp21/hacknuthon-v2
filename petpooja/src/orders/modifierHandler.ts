/**
 * Modifier Handler
 * Resolves and validates modifier selections against menu item modifier groups.
 */

import { ModifierGroup, ModifierOption, SelectedModifier } from '../types';
import { createServiceLogger } from '../utils/logger';
import { normalize } from '../utils/helpers';

const log = createServiceLogger('ModifierHandler');

// ── Known modifier keyword mappings ──────────────────────────────────────────
const SPICE_KEYWORDS: Record<string, string> = {
    mild: 'Mild',
    medium: 'Medium',
    spicy: 'Spicy',
    hot: 'Spicy',
    extra: 'Spicy',
    teekha: 'Spicy',
    tikha: 'Spicy',
    normal: 'Medium',
};

const SIZE_KEYWORDS: Record<string, string> = {
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    full: 'Full',
    half: 'Half',
    chota: 'Small',
    bada: 'Large',
};

/**
 * Resolve a list of spoken modifier strings to SelectedModifier objects.
 * Unrecognised modifiers are skipped with a warning.
 */
export function resolveModifiers(
    mentionedModifiers: string[],
    modifierGroups: ModifierGroup[]
): SelectedModifier[] {
    if (!mentionedModifiers.length || !modifierGroups.length) return [];

    const resolved: SelectedModifier[] = [];

    for (const mention of mentionedModifiers) {
        const lower = normalize(mention);
        let matched = false;

        for (const group of modifierGroups) {
            // Try direct name match
            const directMatch = findOptionByName(lower, group.options);
            if (directMatch) {
                resolved.push(buildSelectedModifier(group, directMatch));
                matched = true;
                break;
            }

            // Try keyword mapping based on group type
            const keywordMatch = resolveByKeyword(lower, group);
            if (keywordMatch) {
                resolved.push(buildSelectedModifier(group, keywordMatch));
                matched = true;
                break;
            }
        }

        if (!matched) {
            log.debug('Modifier not resolved', { mention, groups: modifierGroups.map((g) => g.name) });
        }
    }

    return resolved;
}

/**
 * Validate that all required modifier groups have a selection.
 * Returns an array of group names that are missing required selections.
 */
export function validateRequiredModifiers(
    selected: SelectedModifier[],
    modifierGroups: ModifierGroup[]
): string[] {
    const missing: string[] = [];
    const selectedGroupIds = new Set(selected.map((s) => s.modifier_group_id));

    for (const group of modifierGroups) {
        if (group.required && !selectedGroupIds.has(group.id)) {
            missing.push(group.name);
        }
    }

    return missing;
}

/**
 * Apply default modifier selections for required groups without a selection.
 * Defaults to the first option in each required group.
 */
export function applyDefaultModifiers(
    selected: SelectedModifier[],
    modifierGroups: ModifierGroup[]
): SelectedModifier[] {
    const result = [...selected];
    const selectedGroupIds = new Set(selected.map((s) => s.modifier_group_id));

    for (const group of modifierGroups) {
        if (group.required && !selectedGroupIds.has(group.id)) {
            const firstOption = group.options.find((o) => o.is_available);
            if (firstOption) {
                result.push(buildSelectedModifier(group, firstOption));
                log.debug('Applied default modifier', {
                    group: group.name,
                    option: firstOption.name,
                });
            }
        }
    }

    return result;
}

/**
 * Calculate the price delta from a list of selected modifiers.
 */
export function calculateModifiersDelta(modifiers: SelectedModifier[]): number {
    return modifiers.reduce((sum, m) => sum + m.price_delta, 0);
}

// ── Private helpers ───────────────────────────────────────────────────────────
function buildSelectedModifier(
    group: ModifierGroup,
    option: ModifierOption
): SelectedModifier {
    return {
        modifier_group_id: group.id,
        modifier_group_name: group.name,
        modifier_option_id: option.id,
        modifier_option_name: option.name,
        price_delta: option.price_delta,
    };
}

function findOptionByName(
    lowerText: string,
    options: ModifierOption[]
): ModifierOption | null {
    return (
        options.find((o) => normalize(o.name) === lowerText) ??
        options.find((o) => normalize(o.name).includes(lowerText)) ??
        options.find((o) => lowerText.includes(normalize(o.name))) ??
        null
    );
}

function resolveByKeyword(
    lowerText: string,
    group: ModifierGroup
): ModifierOption | null {
    // Detect which keyword map to use based on group name
    const groupName = normalize(group.name);

    let targetOptionName: string | undefined;

    if (groupName.includes('spice') || groupName.includes('heat')) {
        for (const [keyword, optionName] of Object.entries(SPICE_KEYWORDS)) {
            if (lowerText.includes(keyword)) {
                targetOptionName = optionName;
                break;
            }
        }
    } else if (groupName.includes('size') || groupName.includes('portion')) {
        for (const [keyword, optionName] of Object.entries(SIZE_KEYWORDS)) {
            if (lowerText.includes(keyword)) {
                targetOptionName = optionName;
                break;
            }
        }
    }

    if (!targetOptionName) return null;
    return findOptionByName(normalize(targetOptionName), group.options);
}
