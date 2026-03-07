import { query } from '../../database/postgres'
import type { RagDocument } from '../types'

interface RevenueRow {
  item_id: number
  restaurant_id: number
  cm_rupees: string
  cm_pct: string
  gpi: string
  cm_tier: string
  quadrant: string
  rank_in_cuisine: number
  rank_in_category: number
  upsell_priority: string
  is_upsell_target: boolean
  price_signal: string
  price_signal_why: string
  velocity_per_day: string
  ema_7d: string
  weekend_lift: string
  popularity_score: string
  top_combos: string
  name: string
  selling_price: string
  is_veg: boolean
  cuisine: string
  prep_time_min: number
  kmeans_cluster: number
}

function getUpsellScript(
  quadrant: string,
  name: string,
  price: number
): string {
  if (quadrant === 'Star') {
    return (
      `Suggest ${name} confidently — it's our most loved item. ` +
      `Say: 'Our ${name} is extremely popular and highly recommended at ₹${price}.' ` +
      `Customers who ordered this rated it very well. ` +
      `Good upsell opportunity: mention it naturally after taking main order.`
    )
  }
  if (quadrant === 'Puzzle') {
    return (
      `Actively promote ${name} — it has great profit margin but needs visibility. ` +
      `Say: 'Have you tried our ${name}? It's a hidden gem at ₹${price} — ` +
      `not many people order it but those who do absolutely love it.' ` +
      `This is a high-value upsell — prioritize recommending it.`
    )
  }
  if (quadrant === 'Plowhorse') {
    return (
      `Mention ${name} only if customer asks or it fits naturally. ` +
      `Say: '${name} is one of our most ordered items at ₹${price}.' ` +
      `Don't push it aggressively — it sells itself.`
    )
  }
  return `${name} is available for ₹${price}.`
}

export async function loadRevenueDocuments(): Promise<RagDocument[]> {
  try {
    const result = await query<RevenueRow>(
      `SELECT rs.item_id, rs.restaurant_id,
              rs.cm_rupees, rs.cm_pct, rs.gpi, rs.cm_tier, rs.quadrant,
              rs.rank_in_cuisine, rs.rank_in_category,
              rs.upsell_priority, rs.is_upsell_target,
              rs.price_signal, rs.price_signal_why,
              rs.velocity_per_day, rs.ema_7d, rs.weekend_lift,
              rs.popularity_score, rs.top_combos, rs.kmeans_cluster,
              m.name, m.selling_price, m.is_veg, m.cuisine, m.prep_time_min
       FROM revenue_scores rs
       JOIN menu_items m ON m.item_id = rs.item_id
       WHERE rs.item_id != 20`
    )

    const docs: RagDocument[] = []

    for (const row of result.rows) {
      const cmRupees = parseFloat(row.cm_rupees)
      const cmPct = parseFloat(row.cm_pct)
      const price = parseFloat(row.selling_price)
      const upsellPriority = parseFloat(row.upsell_priority)
      const velocity = parseFloat(row.velocity_per_day)
      const ema = parseFloat(row.ema_7d)
      const popularity = parseFloat(row.popularity_score)

      // Document 1 — revenue_score
      const content1 =
        `${row.name} has a contribution margin of ₹${cmRupees} (${cmPct}% margin). ` +
        `Quadrant: ${row.quadrant}. GPI: ${parseFloat(row.gpi).toFixed(4)}. ` +
        `Ranked #${row.rank_in_cuisine} in ${row.cuisine}. ` +
        `Upsell priority: ${upsellPriority.toFixed(2)}/1.0. Price signal: ${row.price_signal}. ` +
        `${row.price_signal_why}. ` +
        `Velocity: ${velocity.toFixed(2)} orders per day. EMA 7-day: ${ema.toFixed(2)}.`

      docs.push({
        id: `revenue_score_${row.item_id}`,
        type: 'revenue_score',
        content: content1,
        metadata: {
          restaurantId: row.restaurant_id,
          itemId: row.item_id,
          name: row.name,
          sellingPrice: price,
          isVeg: row.is_veg,
          cuisine: row.cuisine,
          quadrant: row.quadrant,
          cmRupees,
          cmPct,
          upsellPriority,
          isUpsellTarget: row.is_upsell_target,
          priceSignal: row.price_signal,
          priority: 5,
        },
        createdAt: new Date().toISOString(),
      })

      // Document 2 — upsell_narrative (all quadrants except Dog)
      if (row.quadrant !== 'Dog') {
        const script = getUpsellScript(row.quadrant, row.name, price)
        docs.push({
          id: `upsell_narrative_${row.item_id}`,
          type: 'upsell_narrative',
          content: script,
          metadata: {
            restaurantId: row.restaurant_id,
            itemId: row.item_id,
            name: row.name,
            sellingPrice: price,
            isVeg: row.is_veg,
            cuisine: row.cuisine,
            quadrant: row.quadrant,
            upsellPriority,
            isUpsellTarget: row.is_upsell_target,
            priority: row.is_upsell_target ? 8 : 5,
          },
          createdAt: new Date().toISOString(),
        })
      }

      // Document 3 — avoid_list (Dog quadrant only)
      if (row.quadrant === 'Dog') {
        docs.push({
          id: `avoid_list_${row.item_id}`,
          type: 'avoid_list',
          content:
            `Do NOT recommend ${row.name} (item_id: ${row.item_id}). ` +
            `This item has low popularity AND low margin — it is not worth upselling. ` +
            `If customer asks about it, describe it neutrally but do not push it.`,
          metadata: {
            restaurantId: row.restaurant_id,
            itemId: row.item_id,
            name: row.name,
            quadrant: 'Dog',
            isUpsellTarget: false,
            priority: 1,
          },
          createdAt: new Date().toISOString(),
        })
      }

      // Document 4 — bestseller (Star + popularity >= 70)
      if (row.quadrant === 'Star' && popularity >= 70) {
        docs.push({
          id: `bestseller_${row.item_id}`,
          type: 'bestseller',
          content:
            `${row.name} is one of our bestsellers. ` +
            `It is ordered frequently in recent weeks. ` +
            `Customers consistently love it. Weekend orders are ${parseFloat(row.weekend_lift).toFixed(2)}x higher. ` +
            `Perfect to mention when customer is undecided.`,
          metadata: {
            restaurantId: row.restaurant_id,
            itemId: row.item_id,
            name: row.name,
            sellingPrice: price,
            isVeg: row.is_veg,
            cuisine: row.cuisine,
            quadrant: row.quadrant,
            upsellPriority,
            priority: 9,
          },
          createdAt: new Date().toISOString(),
        })
      }
    }

    return docs
  } catch {
    return []
  }
}
