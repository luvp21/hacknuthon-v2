/**
 * Revenue Intelligence Engine
 * Pre-computes margin scores, BCG quadrant classification, popularity scores,
 * upsell priority, and combo associations for every menu item.
 *
 * Run manually via: POST /api/revenue/compute
 * Results are written to intelligence.item_scores, intelligence.upsell_rules,
 * intelligence.combo_pairs, and intelligence.blacklist.
 * The Brain reads these during live calls via intelligence.brain_upsell_view.
 */

import { query, queryMany, queryOne } from '../database/postgres';
import { createServiceLogger } from '../utils/logger';
import { RevenueScore, BCGQuadrant, ComboSuggestion } from '../types';

const log = createServiceLogger('RevenueEngine');

// â”€â”€ Internal DB row types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface DBMenuItem {
    id: string;
    name: string;
    category: string;
    price: string;
    food_cost: string | null;
    is_available: boolean;
}

interface OrderLineItem {
    item_id: string;
    qty: number;
}

interface DBOrder {
    id: string;
    items: OrderLineItem[] | string;
    created_at: Date;
}

// â”€â”€ BCG Quadrant logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Thresholds: margin_pct >= 50% = high margin, popularity_score >= 50 = high pop
function classifyBCG(marginPct: number, popularityScore: number): BCGQuadrant {
    const highMargin = marginPct >= 50;
    const highPop = popularityScore >= 50;

    if (highMargin && highPop) return 'Star';
    if (highMargin && !highPop) return 'Hidden Star';
    if (!highMargin && highPop) return 'Risk';
    return 'Dog';
}

// intelligence schema uses lowercase underscore quadrant labels
function toIntelligenceQuadrant(q: BCGQuadrant): string {
    switch (q) {
        case 'Star': return 'star';
        case 'Hidden Star': return 'hidden_star';
        case 'Risk': return 'risk';
        case 'Dog': return 'dog';
    }
}

// â”€â”€ Upsell priority formula â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// upsell_priority = (margin_pct * 0.6) + ((1 - popularity/100) * 0.4)
// Promotes high-margin, under-promoted items. Range 0-1.
function computeUpsellPriority(marginPct: number, popularityScore: number): number {
    const raw = (marginPct / 100) * 0.6 + (1 - popularityScore / 100) * 0.4;
    return Math.round(Math.min(Math.max(raw, 0), 1) * 10000) / 10000;
}

// â”€â”€ Main computation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Compute and persist revenue scores for all menu items of a restaurant.
 * Writes to intelligence schema. Returns the computed scores array.
 */
export async function computeRevenueScores(restaurantId: string): Promise<RevenueScore[]> {
    log.info('Starting revenue score computation', { restaurantId });

    // 1. Load all menu items
    const items = await queryMany<DBMenuItem>(
        `SELECT id, name, category, price, food_cost, is_available
         FROM menu_items WHERE restaurant_id = $1`,
        [restaurantId]
    );

    if (!items.length) {
        log.warn('No menu items found', { restaurantId });
        return [];
    }

    // 2. Load orders from last 30 days
    const recentOrders = await queryMany<DBOrder>(
        `SELECT id, items FROM orders
         WHERE restaurant_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'
           AND status NOT IN ('cancelled', 'error')`,
        [restaurantId]
    );

    // 3. Count sales per item (30d)
    const salesCount30 = new Map<string, number>();
    const salesCount7 = new Map<string, number>();
    const orderItemSets: string[][] = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const order of recentOrders) {
        const lineItems: OrderLineItem[] =
            typeof order.items === 'string' ? JSON.parse(order.items) : order.items ?? [];

        const itemIds: string[] = [];
        for (const li of lineItems) {
            const id = (li as unknown as Record<string, unknown>).menu_item_id as string ?? li.item_id;
            if (!id) continue;
            salesCount30.set(id, (salesCount30.get(id) ?? 0) + (li.qty ?? 1));
            if ((order as unknown as { created_at: Date }).created_at >= sevenDaysAgo) {
                salesCount7.set(id, (salesCount7.get(id) ?? 0) + (li.qty ?? 1));
            }
            itemIds.push(id);
        }
        if (itemIds.length > 1) orderItemSets.push(itemIds);
    }

    // 4. Normalise popularity scores 0-100
    const maxSales = Math.max(1, ...salesCount30.values());
    const totalOrders = Math.max(1, orderItemSets.length);

    // 5. Compute combo associations (co-occurrence)
    const comboCounts = new Map<string, number>();
    for (const set of orderItemSets) {
        const unique = [...new Set(set)];
        for (let i = 0; i < unique.length; i++) {
            for (let j = i + 1; j < unique.length; j++) {
                const [a, b] = [unique[i], unique[j]].sort();
                const key = `${a}|${b}`;
                comboCounts.set(key, (comboCounts.get(key) ?? 0) + 1);
            }
        }
    }

    const itemOccurrence = new Map<string, number>();
    for (const set of orderItemSets) {
        for (const id of new Set(set)) {
            itemOccurrence.set(id, (itemOccurrence.get(id) ?? 0) + 1);
        }
    }

    // 6. Persist combo_pairs to intelligence schema
    for (const [key, count] of comboCounts.entries()) {
        if (count < 2) continue;
        const [a, b] = key.split('|');
        const occA = itemOccurrence.get(a) ?? 1;
        const occB = itemOccurrence.get(b) ?? 1;
        const confAB = count / occA;
        const confBA = count / occB;
        const pB = occB / totalOrders;
        const lift = confAB / Math.max(pB, 0.001);

        await query(
            `INSERT INTO intelligence.combo_pairs
               (item_a_id, item_b_id, co_occurrence_count, confidence_a_to_b, confidence_b_to_a, lift, computed_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (item_a_id, item_b_id) DO UPDATE SET
               co_occurrence_count = EXCLUDED.co_occurrence_count,
               confidence_a_to_b   = EXCLUDED.confidence_a_to_b,
               confidence_b_to_a   = EXCLUDED.confidence_b_to_a,
               lift                = EXCLUDED.lift,
               computed_at         = now()`,
            [a, b, count, confAB, confBA, lift]
        );
    }

    // Build top combos per item (for legacy RevenueScore type)
    const topCombosMap = new Map<string, ComboSuggestion[]>();
    const itemNameMap = new Map(items.map((i) => [i.id, i.name]));
    for (const [key, count] of comboCounts.entries()) {
        if (count < 2) continue;
        const [a, b] = key.split('|');
        const occA = itemOccurrence.get(a) ?? 1;
        const occB = itemOccurrence.get(b) ?? 1;
        const confAB = count / occA;
        const confBA = count / occB;

        if (!topCombosMap.has(a)) topCombosMap.set(a, []);
        if (!topCombosMap.has(b)) topCombosMap.set(b, []);
        topCombosMap.get(a)!.push({ item_id: b, item_name: itemNameMap.get(b) ?? b, confidence: confAB });
        topCombosMap.get(b)!.push({ item_id: a, item_name: itemNameMap.get(a) ?? a, confidence: confBA });
    }
    for (const [id, combos] of topCombosMap.entries()) {
        topCombosMap.set(id, combos.sort((x, y) => y.confidence - x.confidence).slice(0, 5));
    }

    // 7. UPSERT intelligence.item_scores + build return array
    const scores: RevenueScore[] = [];

    for (const item of items) {
        const price = parseFloat(item.price);
        const foodCost = item.food_cost ? parseFloat(item.food_cost) : price * 0.40;
        const contributionMargin = Math.round((price - foodCost) * 100) / 100;
        const marginPct = Math.round(((price - foodCost) / Math.max(price, 0.01)) * 10000) / 100;
        const unitsSold30 = salesCount30.get(item.id) ?? 0;
        const unitsSold7 = salesCount7.get(item.id) ?? 0;
        const popularityScore = Math.round((unitsSold30 / maxSales) * 100 * 100) / 100;
        const quadrant = classifyBCG(marginPct, popularityScore);
        const iqLabel = toIntelligenceQuadrant(quadrant);
        const upsellPriority = computeUpsellPriority(marginPct, popularityScore);
        const upsellEligible = quadrant === 'Hidden Star' || quadrant === 'Star';
        const topCombos = topCombosMap.get(item.id) ?? [];

        await query(
            `INSERT INTO intelligence.item_scores
               (item_id, item_name, selling_price, food_cost, contribution_margin,
                margin_pct, units_sold_30d, units_sold_7d, popularity_score,
                quadrant, upsell_priority, upsell_eligible, computed_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())
             ON CONFLICT (item_id) DO UPDATE SET
               item_name           = EXCLUDED.item_name,
               selling_price       = EXCLUDED.selling_price,
               food_cost           = EXCLUDED.food_cost,
               contribution_margin = EXCLUDED.contribution_margin,
               margin_pct          = EXCLUDED.margin_pct,
               units_sold_30d      = EXCLUDED.units_sold_30d,
               units_sold_7d       = EXCLUDED.units_sold_7d,
               popularity_score    = EXCLUDED.popularity_score,
               quadrant            = EXCLUDED.quadrant,
               upsell_priority     = EXCLUDED.upsell_priority,
               upsell_eligible     = EXCLUDED.upsell_eligible,
               computed_at         = now(),
               updated_at          = now()`,
            [
                item.id, item.name, price, foodCost, contributionMargin,
                marginPct, unitsSold30, unitsSold7, popularityScore,
                iqLabel, upsellPriority, upsellEligible,
            ]
        );

        scores.push({
            item_id: item.id,
            restaurant_id: restaurantId,
            margin_score: contributionMargin,
            margin_pct: marginPct,
            popularity_score: popularityScore,
            quadrant,
            upsell_priority: upsellPriority,
            top_combos: topCombos,
            last_computed: new Date(),
        });
    }

    // 8. UPSERT intelligence.upsell_rules from combo_pairs
    //    a) frequently_together rules for all eligible combo pairs
    await query(
        `INSERT INTO intelligence.upsell_rules
           (trigger_item_id, suggest_item_id, rule_type, confidence, lift, priority, is_active, computed_at)
         SELECT
           cp.item_a_id, cp.item_b_id,
           'frequently_together', cp.confidence_a_to_b, cp.lift, 1, true, now()
         FROM intelligence.combo_pairs cp
         JOIN intelligence.item_scores sa ON sa.item_id = cp.item_a_id
         JOIN intelligence.item_scores sb ON sb.item_id = cp.item_b_id
         WHERE sb.upsell_eligible = true
         ON CONFLICT (trigger_item_id, suggest_item_id) DO UPDATE SET
           confidence   = EXCLUDED.confidence,
           lift         = EXCLUDED.lift,
           computed_at  = now()`,
        []
    );

    // Direction: b â†’ a combos
    await query(
        `INSERT INTO intelligence.upsell_rules
           (trigger_item_id, suggest_item_id, rule_type, confidence, lift, priority, is_active, computed_at)
         SELECT
           cp.item_b_id, cp.item_a_id,
           'frequently_together', cp.confidence_b_to_a, cp.lift, 1, true, now()
         FROM intelligence.combo_pairs cp
         JOIN intelligence.item_scores sa ON sa.item_id = cp.item_a_id
         JOIN intelligence.item_scores sb ON sb.item_id = cp.item_b_id
         WHERE sa.upsell_eligible = true
         ON CONFLICT (trigger_item_id, suggest_item_id) DO UPDATE SET
           confidence   = EXCLUDED.confidence,
           lift         = EXCLUDED.lift,
           computed_at  = now()`,
        []
    );

    //    b) high_margin_push rules: every menu item triggers hidden_star suggestions
    await query(
        `INSERT INTO intelligence.upsell_rules
           (trigger_item_id, suggest_item_id, rule_type, confidence, lift, priority, is_active, computed_at)
         SELECT
           mi.id AS trigger_item_id,
           hs.item_id AS suggest_item_id,
           'high_margin_push', hs.upsell_priority, 0, 2, true, now()
         FROM public.menu_items mi
         CROSS JOIN (
             SELECT item_id, upsell_priority FROM intelligence.item_scores
             WHERE quadrant = 'hidden_star' AND upsell_eligible = true
         ) hs
         WHERE mi.id != hs.item_id
         ON CONFLICT (trigger_item_id, suggest_item_id) DO NOTHING`,
        []
    );

    // 9. Auto-blacklist dog quadrant items
    await query(
        `INSERT INTO intelligence.blacklist (item_id, reason, added_by)
         SELECT item_id, 'underperforming', 'analytics'
         FROM intelligence.item_scores
         WHERE quadrant = 'dog'
         ON CONFLICT (item_id) DO NOTHING`,
        []
    );

    log.info('Revenue scores computed and intelligence schema updated', {
        restaurantId,
        itemCount: scores.length,
        stars: scores.filter((s) => s.quadrant === 'Star').length,
        hiddenStars: scores.filter((s) => s.quadrant === 'Hidden Star').length,
        risks: scores.filter((s) => s.quadrant === 'Risk').length,
        dogs: scores.filter((s) => s.quadrant === 'Dog').length,
    });

    return scores;
}

/**
 * Read pre-computed revenue scores from intelligence.item_scores.
 * Filtered to items belonging to the given restaurant via menu_items JOIN.
 */
export async function getRevenueScores(restaurantId: string): Promise<RevenueScore[]> {
    const rows = await queryMany<{
        item_id: string;
        item_name: string;
        margin_pct: string;
        popularity_score: string;
        quadrant: string;
        upsell_priority: string;
        computed_at: Date;
    }>(
        `SELECT s.item_id, s.item_name, s.margin_pct, s.popularity_score,
                s.quadrant, s.upsell_priority, s.computed_at
           FROM intelligence.item_scores s
           JOIN public.menu_items mi ON mi.id = s.item_id
          WHERE mi.restaurant_id = $1
          ORDER BY s.upsell_priority DESC`,
        [restaurantId]
    );

    return rows.map((r) => ({
        item_id: r.item_id,
        restaurant_id: restaurantId,
        margin_score: 0,
        margin_pct: parseFloat(r.margin_pct),
        popularity_score: parseFloat(r.popularity_score),
        quadrant: intelligenceToLegacyQuadrant(r.quadrant),
        upsell_priority: parseFloat(r.upsell_priority),
        top_combos: [],
        last_computed: new Date(r.computed_at),
    }));
}

/**
 * Get intelligence score for a single item. Returns null if not yet computed.
 */
export async function getItemScore(itemId: string): Promise<RevenueScore | null> {
    const row = await queryOne<{
        item_id: string;
        margin_pct: string;
        popularity_score: string;
        quadrant: string;
        upsell_priority: string;
        computed_at: Date;
    }>(
        `SELECT item_id, margin_pct, popularity_score, quadrant, upsell_priority, computed_at
           FROM intelligence.item_scores WHERE item_id = $1`,
        [itemId]
    );

    if (!row) return null;

    return {
        item_id: row.item_id,
        restaurant_id: '',
        margin_score: 0,
        margin_pct: parseFloat(row.margin_pct),
        popularity_score: parseFloat(row.popularity_score),
        quadrant: intelligenceToLegacyQuadrant(row.quadrant),
        upsell_priority: parseFloat(row.upsell_priority),
        top_combos: [],
        last_computed: new Date(row.computed_at),
    };
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function intelligenceToLegacyQuadrant(q: string): BCGQuadrant {
    switch (q) {
        case 'star': return 'Star';
        case 'hidden_star': return 'Hidden Star';
        case 'risk': return 'Risk';
        default: return 'Dog';
    }
}
