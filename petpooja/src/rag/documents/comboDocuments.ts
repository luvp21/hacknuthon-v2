import { query } from '../../database/postgres'
import type { RagDocument } from '../types'

interface ComboRow {
  combo_id: number
  restaurant_id: number
  item_a: number
  item_b: number
  item_c: number | null
  combo_type: string
  combo_size: number
  support: string
  confidence: string
  lift: string
  upsell_score: string
  synergy_score: string
  combo_cm_rupees: string
  max_discount_pct: string
  popularity_rank: number
  co_count: number
  item_a_name: string
  item_a_price: string
  item_b_name: string
  item_b_price: string
  item_c_name: string | null
  item_c_price: string | null
}

export async function loadComboDocuments(): Promise<RagDocument[]> {
  try {
    const result = await query<ComboRow>(
      `SELECT c.*,
              ma.name AS item_a_name, ma.selling_price AS item_a_price,
              mb.name AS item_b_name, mb.selling_price AS item_b_price,
              mc.name AS item_c_name, mc.selling_price AS item_c_price
       FROM combos c
       JOIN menu_items ma ON ma.item_id = c.item_a
       JOIN menu_items mb ON mb.item_id = c.item_b
       LEFT JOIN menu_items mc ON mc.item_id = c.item_c
       WHERE c.restaurant_id = 1`
    )

    const docs: RagDocument[] = []

    for (const row of result.rows) {
      const confidence = parseFloat(row.confidence)
      const lift = parseFloat(row.lift)
      const maxDiscount = parseFloat(row.max_discount_pct)
      const upsellScore = parseFloat(row.upsell_score)
      const priceA = parseFloat(row.item_a_price)
      const priceB = parseFloat(row.item_b_price)
      const priceC = row.item_c_price ? parseFloat(row.item_c_price) : null
      const combinedPrice = priceA + priceB + (priceC ?? 0)

      const itemNames = row.item_c_name
        ? `${row.item_a_name}, ${row.item_b_name}, and ${row.item_c_name}`
        : `${row.item_a_name} and ${row.item_b_name}`

      const itemIds = row.item_c
        ? [row.item_a, row.item_b, row.item_c]
        : [row.item_a, row.item_b]

      // Document 1 — combo (structured)
      let content1: string
      if (row.combo_type === 'trio') {
        content1 =
          `${row.item_a_name}, ${row.item_b_name}, and ${row.item_c_name} form a perfect set. ` +
          `Confidence: ${(confidence * 100).toFixed(0)}%. Up to ${maxDiscount}% discount on this trio. ` +
          `Combined price: ₹${combinedPrice}. ` +
          `Ranked #${row.popularity_rank} popular combo. Ordered together ${row.co_count} times. ` +
          `Upsell score: ${upsellScore.toFixed(2)}. Great for vegetarian customers.`
      } else {
        content1 =
          `${row.item_a_name} and ${row.item_b_name} are a popular combo pair. ` +
          `They are ordered together ${(confidence * 100).toFixed(0)}% of the time ` +
          `(confidence: ${confidence.toFixed(2)}, lift: ${lift.toFixed(2)}). ` +
          `Combined regular price: ₹${combinedPrice}. Up to ${maxDiscount}% discount available. ` +
          `Upsell score: ${upsellScore.toFixed(2)}. Margin: ₹${parseFloat(row.combo_cm_rupees)}. ` +
          `Ranked #${row.popularity_rank} most popular combo. Ordered together ${row.co_count} times.`
      }

      docs.push({
        id: `combo_${row.combo_id}`,
        type: 'combo',
        content: content1,
        metadata: {
          restaurantId: row.restaurant_id,
          comboId: row.combo_id,
          itemIds,
          names: [row.item_a_name, row.item_b_name, ...(row.item_c_name ? [row.item_c_name] : [])],
          discountValue: maxDiscount,
          confidence,
          priority: 10 - row.popularity_rank,
        },
        createdAt: new Date().toISOString(),
      })

      // Document 2 — combo_narrative (voice script)
      let narrativeContent: string
      if (row.combo_id === 1) {
        narrativeContent =
          `When customer orders ${row.item_a_name}, say: ` +
          `'Great choice! Our ${row.item_a_name} pairs perfectly with ${row.item_b_name} — ` +
          `most of our customers order them together. Shall I add a ${row.item_b_name} for ₹${priceB}?' ` +
          `If they order ${row.item_b_name}: mention ${row.item_a_name} as the natural main course. ` +
          `This is our #1 combo — high confidence upsell.`
      } else if (row.combo_id === 2) {
        narrativeContent =
          `When customer orders ${row.item_a_name}, say: ` +
          `'${row.item_a_name} goes beautifully with a chilled ${row.item_b_name} — ` +
          `want one for ₹${priceB}? ` +
          `And for dessert, our ${row.item_c_name ?? 'Gulab Jamun'} is the perfect finish at ₹${priceC ?? 150}.' ` +
          `Great for vegetarian customers wanting a complete meal.`
      } else if (row.combo_id === 3) {
        narrativeContent =
          `When customer orders either pizza or pasta, say: ` +
          `'Our ${row.item_a_name} and ${row.item_b_name} are a classic Italian duo — ` +
          `most Italian food lovers order both. Together they make a great sharing meal.' ` +
          `High lift (${lift.toFixed(2)}) — statistically strong pairing.`
      } else {
        narrativeContent =
          `${itemNames} go well together. ` +
          `Confidence: ${(confidence * 100).toFixed(0)}%. Combined price: ₹${combinedPrice}. ` +
          `Up to ${maxDiscount}% discount available. Suggest these together when relevant.`
      }

      docs.push({
        id: `combo_narrative_${row.combo_id}`,
        type: 'combo_narrative',
        content: narrativeContent,
        metadata: {
          restaurantId: row.restaurant_id,
          comboId: row.combo_id,
          itemIds,
          names: [row.item_a_name, row.item_b_name, ...(row.item_c_name ? [row.item_c_name] : [])],
          confidence,
          discountValue: maxDiscount,
          priority: 9,
        },
        createdAt: new Date().toISOString(),
      })

      // Cross-reference docs for each item in the combo
      const comboItems = [
        { id: row.item_a, name: row.item_a_name },
        { id: row.item_b, name: row.item_b_name },
        ...(row.item_c && row.item_c_name ? [{ id: row.item_c, name: row.item_c_name }] : []),
      ]

      for (const item of comboItems) {
        const partnersExcluding = comboItems.filter((i) => i.id !== item.id)
        const partnerNames = partnersExcluding.map((i) => i.name).join(' and ')
        const partnerIds = partnersExcluding.map((i) => i.id)

        docs.push({
          id: `combo_xref_${row.combo_id}_item_${item.id}`,
          type: 'combo',
          content:
            `${item.name} (item ${item.id}) is part of Combo ${row.combo_id} with ${partnerNames}. ` +
            `Upsell trigger: when item ${item.id} is in cart, suggest ${partnerNames} (items ${partnerIds.join(', ')}).`,
          metadata: {
            restaurantId: row.restaurant_id,
            comboId: row.combo_id,
            itemId: item.id,
            itemIds,
            confidence,
            priority: 7,
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
