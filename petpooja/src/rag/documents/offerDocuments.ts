import { query } from '../../database/postgres'
import type { RagDocument } from '../types'

interface OfferRow {
  offer_id: number
  restaurant_id: number
  offer_type: string
  min_cart_value: string
  discount_type: string
  discount_value: string
  nudge_text: string
  display_text: string
  is_active: boolean
  valid_from: string
  valid_to: string
  channel: string
  max_uses_per_day: number
  uses_today: number
}

export async function loadOfferDocuments(): Promise<RagDocument[]> {
  try {
    const result = await query<OfferRow>(
      `SELECT * FROM active_offers
       WHERE is_active = true AND valid_to > now() AND restaurant_id = 1`
    )

    const docs: RagDocument[] = []

    for (const row of result.rows) {
      const minCart = parseFloat(row.min_cart_value)
      const discount = parseFloat(row.discount_value)

      if (row.offer_id === 1) {
        // Offer 1 — 10% above ₹500
        docs.push({
          id: `offer_${row.offer_id}`,
          type: 'offer',
          content:
            `There is a 10% discount available when your order total reaches ₹500 or more. ` +
            `Add ₹500 or more to your cart and automatically get 10% off the entire order. ` +
            `This offer applies to all ordering channels including voice, app, and walk-in. ` +
            `Valid until June 2026. Available up to ${row.max_uses_per_day} uses per day. ` +
            `Offer message: '${row.nudge_text}'`,
          metadata: {
            restaurantId: row.restaurant_id,
            offerId: row.offer_id,
            minCartValue: minCart,
            discountValue: discount,
            isAvailable: row.is_active,
            priority: 9,
          },
          createdAt: new Date().toISOString(),
        })

        // Offer 1 eligibility helper
        docs.push({
          id: `offer_eligibility_${row.offer_id}`,
          type: 'offer_eligibility',
          content:
            `If a customer's cart is between ₹300 and ₹499, they are close to the 10% off offer. ` +
            `Tell them: 'You are just a little away from getting 10% off your entire order!' ` +
            `The 10% discount on a ₹500 order saves ₹50. ` +
            `The 10% discount on a ₹700 order saves ₹70. ` +
            `Suggest adding: Butter Naan (₹90), Sweet Lassi (₹120), Gulab Jamun (₹150) ` +
            `as easy additions to reach the ₹500 threshold. ` +
            `Hindi: '₹500 se zyada order karein aur paayein 10% chhoot!'`,
          metadata: {
            restaurantId: row.restaurant_id,
            offerId: row.offer_id,
            minCartValue: minCart,
            discountValue: discount,
            itemIds: [9, 11, 12],
            priority: 9,
          },
          createdAt: new Date().toISOString(),
        })
      } else if (row.offer_id === 2) {
        // Offer 2 — 20% above ₹900
        docs.push({
          id: `offer_${row.offer_id}`,
          type: 'offer',
          content:
            `Customers ordering ₹900 or more receive 20% off — a significant saving. ` +
            `On a ₹900 order, this saves ₹180. ` +
            `This is for larger orders or group dining. ` +
            `Offer message: '${row.nudge_text}' ` +
            `Valid until June 2026. ₹900 se zyada order karein, 20% ki chhoot paayein!`,
          metadata: {
            restaurantId: row.restaurant_id,
            offerId: row.offer_id,
            minCartValue: minCart,
            discountValue: discount,
            isAvailable: row.is_active,
            priority: 9,
          },
          createdAt: new Date().toISOString(),
        })

        // Offer 2 eligibility helper
        docs.push({
          id: `offer_eligibility_${row.offer_id}`,
          type: 'offer_eligibility',
          content:
            `If cart is between ₹600 and ₹899, customer is approaching the 20% off threshold. ` +
            `Say: 'Adding just a little more unlocks 20% off your entire order — that's huge savings!' ` +
            `20% on ₹900 = ₹180 saved. 20% on ₹1200 = ₹240 saved. ` +
            `Suggest adding: Margherita Pizza (₹420), Butter Chicken (₹380), Chicken Alfredo (₹450) ` +
            `as items that would push cart over ₹900. ` +
            `Hindi: 'Thoda aur add karo, 20% discount unlock ho jaayega!'`,
          metadata: {
            restaurantId: row.restaurant_id,
            offerId: row.offer_id,
            minCartValue: minCart,
            discountValue: discount,
            itemIds: [15, 5, 17],
            priority: 9,
          },
          createdAt: new Date().toISOString(),
        })
      } else {
        // Generic offer document
        docs.push({
          id: `offer_${row.offer_id}`,
          type: 'offer',
          content:
            `Spend ₹${minCart} or more and get ${discount}% off your order. ` +
            `${row.nudge_text} Valid until ${new Date(row.valid_to).toLocaleDateString('en-IN')}.`,
          metadata: {
            restaurantId: row.restaurant_id,
            offerId: row.offer_id,
            minCartValue: minCart,
            discountValue: discount,
            isAvailable: row.is_active,
            priority: 7,
          },
          createdAt: new Date().toISOString(),
        })
      }
    }

    // Combined offer overview
    docs.push({
      id: 'offer_overview',
      type: 'offer',
      content:
        `Tadka and Twist has two active discounts: ` +
        `1. Spend ₹500 or more and get 10% off (saves ₹50 on a ₹500 order). ` +
        `2. Spend ₹900 or more and get 20% off (saves ₹180 on a ₹900 order). ` +
        `Both offers apply automatically — no code needed. ` +
        `Always mention the relevant offer when cart is approaching the threshold. ` +
        `Koi bhi discount code zaruri nahi — offer apne aap apply hota hai. ` +
        `Offer hai? Haan, ₹500 se upar 10% chhoot, ₹900 se upar 20% chhoot.`,
      metadata: {
        restaurantId: 1,
        itemIds: [1, 2],
        discountValue: 20,
        priority: 9,
      },
      createdAt: new Date().toISOString(),
    })

    return docs
  } catch {
    return []
  }
}
