/**
 * Menu Matcher
 * Fuzzy-matches spoken item names to canonical menu items.
 * Supports English, Hindi, Hinglish aliases.
 * Uses Fuse.js for fuzzy search with configurable thresholds.
 */

import Fuse, { IFuseOptions } from 'fuse.js';
import { MenuItem } from '../types';
import { normalize } from '../utils/helpers';
import { createServiceLogger } from '../utils/logger';

const log = createServiceLogger('MenuMatcher');

// ── Fuse.js configuration ────────────────────────────────────────────────────
const FUSE_OPTIONS: IFuseOptions<MenuItem> = {
    keys: [
        { name: 'name', weight: 0.5 },
        { name: 'name_hi', weight: 0.3 },
        { name: 'name_hinglish', weight: 0.3 },
        { name: 'aliases', weight: 0.4 },
        { name: 'category', weight: 0.1 },
    ],
    threshold: 0.4,           // Lower = more strict. 0.4 is a good balance.
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
    useExtendedSearch: true,  // Enables prefix/suffix matching
};

export class MenuMatcher {
    private fuse: Fuse<MenuItem> | null = null;
    private lastMenuHash = '';

    /**
     * Build or rebuild the Fuse.js index from a list of menu items.
     */
    buildIndex(menuItems: MenuItem[]): void {
        // Only rebuild if menu changed
        const hash = menuItems.map((m) => m.id).sort().join(',');
        if (hash === this.lastMenuHash) return;

        this.fuse = new Fuse(menuItems, FUSE_OPTIONS);
        this.lastMenuHash = hash;
        log.debug('Fuse.js index rebuilt', { itemCount: menuItems.length });
    }

    /**
     * Find the best matching menu item for a spoken item name.
     * Returns null if no match exceeds the confidence threshold.
     */
    findBestMatch(
        itemName: string,
        menuItems: MenuItem[],
        options?: { threshold?: number }
    ): { item: MenuItem; confidence: number } | null {
        this.buildIndex(menuItems);
        if (!this.fuse) return null;

        const results = this.fuse.search(normalize(itemName));

        if (!results.length) return null;

        const best = results[0];
        const score = best.score ?? 1;              // Fuse score: 0 = perfect, 1 = no match
        const confidence = parseFloat((1 - score).toFixed(2));
        const threshold = options?.threshold ?? 0.5;

        if (confidence < threshold) {
            log.debug('No confident match', { itemName, bestScore: score, confidence });
            return null;
        }

        log.debug('Match found', { itemName, matched: best.item.name, confidence });
        return { item: best.item, confidence };
    }

    /**
     * Find multiple candidate matches (used for clarification when ambiguous).
     */
    findCandidates(
        itemName: string,
        menuItems: MenuItem[],
        maxCandidates = 3
    ): Array<{ item: MenuItem; confidence: number }> {
        this.buildIndex(menuItems);
        if (!this.fuse) return [];

        const results = this.fuse.search(normalize(itemName), { limit: maxCandidates });

        return results
            .filter((r) => (r.score ?? 1) < 0.6)
            .map((r) => ({
                item: r.item,
                confidence: parseFloat((1 - (r.score ?? 1)).toFixed(2)),
            }));
    }

    /**
     * Exact match by ID (fast path used after LLM provides an item ID).
     */
    findById(itemId: string, menuItems: MenuItem[]): MenuItem | null {
        return menuItems.find((m) => m.id === itemId) ?? null;
    }

    /**
     * Check if an item name is ambiguous (multiple close matches).
     */
    isAmbiguous(
        itemName: string,
        menuItems: MenuItem[],
        maxScore = 0.4
    ): boolean {
        const candidates = this.findCandidates(itemName, menuItems, 5);
        const closeMatches = candidates.filter((c) => c.confidence > maxScore);
        return closeMatches.length >= 2;
    }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const menuMatcher = new MenuMatcher();
