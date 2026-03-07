import type { RagDocument } from '../types'

export function loadCustomerSegmentDocuments(): RagDocument[] {
  const now = new Date().toISOString()

  return [
    {
      id: 'customer_segment_loyal',
      type: 'customer_segment',
      content:
        `Loyal customers at Tadka and Twist prefer Punjabi main courses. ` +
        `They visit 6 or more times and spend ₹640 per visit on average. ` +
        `Top items for loyal customers: Butter Chicken (₹380), Butter Naan (₹90), ` +
        `Kadhai Chicken (₹360), Gulab Jamun (₹150). ` +
        `They respond well to premium upsells and repeat their favourite orders. ` +
        `Approach: greet warmly, confirm if they want the usual. ` +
        `Loyal hain toh best items suggest karo!`,
      metadata: {
        restaurantId: 1,
        itemIds: [5, 9, 8, 12],
        cuisine: 'Punjabi',
        priority: 7,
      },
      createdAt: now,
    },
    {
      id: 'customer_segment_regular_italian',
      type: 'customer_segment',
      content:
        `Regular Italian-preferring customers order Margherita Pizza and Pasta frequently. ` +
        `Average spend: ₹560 per visit. Visit 4 times. ` +
        `Top items: Margherita Pizza (₹420), Pasta Arrabbiata (₹320), Tiramisu (₹250). ` +
        `They respond well to combo offers (pizza + pasta bundle). ` +
        `Mention the ₹900 offer — their typical order is close to that threshold.`,
      metadata: {
        restaurantId: 1,
        itemIds: [15, 16, 19],
        cuisine: 'Italian',
        priority: 6,
      },
      createdAt: now,
    },
    {
      id: 'customer_segment_new',
      type: 'customer_segment',
      content:
        `New and casual customers typically start with starters like Paneer Tikka. ` +
        `Average spend: ₹490. Visit 2 times so far. ` +
        `They are still exploring the menu — give broader recommendations. ` +
        `Good entry points: Paneer Tikka (₹280), Bruschetta (₹180), Sweet Lassi (₹120). ` +
        `Combo suggestion: Paneer Tikka plus Lassi combo (₹400 total — near ₹500 offer threshold). ` +
        `Naye customers ke liye easy recommendations dein.`,
      metadata: {
        restaurantId: 1,
        itemIds: [1, 13, 11],
        cuisine: 'Punjabi',
        priority: 5,
      },
      createdAt: now,
    },
    {
      id: 'customer_segment_voice_channel',
      type: 'customer_segment',
      content:
        `Voice channel customers at this restaurant tend to order: ` +
        `Butter Chicken, Butter Naan, Sarson Ka Saag, Paneer Tikka. ` +
        `Voice orders average ₹653 per order. ` +
        `They are receptive to spoken upsell suggestions — mention combos clearly. ` +
        `Keep responses short and clear on voice calls. ` +
        `Phone pe order karne wale customers ko combo suggest karo.`,
      metadata: {
        restaurantId: 1,
        itemIds: [5, 9, 7, 1],
        priority: 8,
      },
      createdAt: now,
    },
    {
      id: 'customer_segment_upsell_acceptance',
      type: 'customer_segment',
      content:
        `Customers at Tadka and Twist have a strong upsell acceptance rate. ` +
        `Most accepted upsells are: Butter Naan, Sweet Lassi, Gulab Jamun, Tiramisu. ` +
        `Most effective upsells are desserts (Gulab Jamun, Tiramisu) and beverages (Sweet Lassi). ` +
        `Bread upsell (Butter Naan) has highest attach rate with main courses. ` +
        `Average 1-2 upsold items per order accepted.`,
      metadata: {
        restaurantId: 1,
        itemIds: [9, 11, 12, 19],
        priority: 8,
      },
      createdAt: now,
    },
    {
      id: 'customer_segment_day_part_patterns',
      type: 'customer_segment',
      content:
        `Lunch orders (day_part=lunch) tend to be lighter: ` +
        `Dal Makhani, Makki di Roti, Sweet Lassi, Paneer Tikka. ` +
        `Average lunch spend: ₹490. ` +
        `Dinner orders are larger: Butter Chicken, Wood-fired Pizza, Chicken Alfredo. ` +
        `Average dinner spend: ₹750 or more. ` +
        `Evening orders often include starters and beverages before mains.`,
      metadata: {
        restaurantId: 1,
        priority: 6,
      },
      createdAt: now,
    },
  ]
}
