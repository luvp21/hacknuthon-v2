import type { RagDocument } from '../types'

export function loadDayPartDocuments(): RagDocument[] {
  const now = new Date().toISOString()

  return [
    {
      id: 'day_part_lunch',
      type: 'day_part',
      content:
        `Best items for lunch at Tadka and Twist: ` +
        `Light and satisfying: Dal Makhani (₹220) plus Makki di Roti (₹100) = ₹320. ` +
        `Quick lunch: Paneer Tikka (₹280) plus Sweet Lassi (₹120) = ₹400. ` +
        `Italian lunch: Pasta Arrabbiata (₹320) plus Soup del Giorno (₹160) = ₹480. ` +
        `Average lunch customer spends ₹490. Lunch orders are lighter than dinner. ` +
        `Dopahar ka khana: dal makhani, paneer tikka, pasta, soup.`,
      metadata: {
        restaurantId: 1,
        itemIds: [4, 10, 1, 11, 16, 14],
        priority: 6,
      },
      createdAt: now,
    },
    {
      id: 'day_part_dinner',
      type: 'day_part',
      content:
        `Popular dinner orders at Tadka and Twist: ` +
        `Classic Punjabi dinner: Butter Chicken (₹380) plus Butter Naan (₹90) ` +
        `plus Gulab Jamun (₹150) = ₹620. ` +
        `Italian dinner: Margherita Pizza (₹420) plus Pasta Arrabbiata (₹320) ` +
        `plus Tiramisu (₹250) = ₹990 — gets 20% off! ` +
        `Premium dinner: Wood-fired Chicken Pizza (₹520) plus Chicken Alfredo (₹450) = ₹970. ` +
        `Average dinner customer spends ₹750 or more. ` +
        `Dinner orders above ₹900 get 20% off. ` +
        `Raat ka khana: butter chicken, pizza, chicken alfredo, gulab jamun.`,
      metadata: {
        restaurantId: 1,
        itemIds: [5, 9, 12, 15, 16, 19, 18, 17],
        priority: 6,
      },
      createdAt: now,
    },
    {
      id: 'day_part_evening',
      type: 'day_part',
      content:
        `Evening snack options at Tadka and Twist: ` +
        `Paneer Tikka (₹280), Chicken Tikka (₹320), Bruschetta (₹180), Sweet Lassi (₹120). ` +
        `Light and social — great for sharing. ` +
        `Evening customers often order starters and beverages without heavy mains. ` +
        `Shaam ka snack: paneer tikka, chicken tikka, bruschetta, lassi.`,
      metadata: {
        restaurantId: 1,
        itemIds: [1, 2, 13, 11],
        priority: 5,
      },
      createdAt: now,
    },
    {
      id: 'day_part_all_day',
      type: 'day_part',
      content:
        `Items ordered across all times of day: ` +
        `Butter Chicken, Butter Naan, Paneer Tikka, Margherita Pizza, Sweet Lassi. ` +
        `These are safe recommendations regardless of time of day or customer type. ` +
        `Always available and consistently loved. ` +
        `Best dishes anytime: butter chicken, paneer tikka, margherita pizza, butter naan.`,
      metadata: {
        restaurantId: 1,
        itemIds: [5, 9, 1, 15, 11],
        priority: 8,
      },
      createdAt: now,
    },
  ]
}
