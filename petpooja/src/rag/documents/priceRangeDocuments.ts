import type { RagDocument } from '../types'

export function loadPriceRangeDocuments(): RagDocument[] {
  const now = new Date().toISOString()

  return [
    {
      id: 'price_range_under_200',
      type: 'price_range',
      content:
        `Budget-friendly items under ₹200 at Tadka and Twist: ` +
        `Butter Naan ₹90, Makki di Roti ₹100, Sweet Lassi ₹120, Gulab Jamun ₹150, ` +
        `Soup del Giorno ₹160, Bruschetta al Pomodoro ₹180. ` +
        `Total 6 items. Great for adding sides or desserts without breaking the budget. ` +
        `Most affordable item: Butter Naan at ₹90. ` +
        `Sasta item: Butter Naan, Lassi, Gulab Jamun, Soup, Bruschetta. Kam daam mein kya milega.`,
      metadata: {
        restaurantId: 1,
        priceRange: 'under_200',
        maxPrice: 200,
        itemIds: [9, 10, 11, 12, 14, 13],
        priority: 8,
      },
      createdAt: now,
    },
    {
      id: 'price_range_200_400',
      type: 'price_range',
      content:
        `Mid-range items between ₹200 and ₹400: ` +
        `Dal Makhani ₹220, Paneer Tikka ₹280, Pasta Arrabbiata ₹320, ` +
        `Chicken Tikka ₹320, Sarson Ka Saag ₹260, Amritsari Fish Fry ₹350, ` +
        `Kadhai Chicken ₹360, Butter Chicken ₹380, Paneer Butter Masala ₹340. ` +
        `9 items in this range — the core of our menu. ` +
        `Best value main course: Dal Makhani ₹220. ` +
        `₹200 se ₹400 tak ke items: dal makhani, paneer tikka, butter chicken.`,
      metadata: {
        restaurantId: 1,
        priceRange: '200_400',
        minPrice: 200,
        maxPrice: 400,
        itemIds: [4, 1, 16, 2, 7, 3, 8, 5, 6],
        priority: 8,
      },
      createdAt: now,
    },
    {
      id: 'price_range_400_600',
      type: 'price_range',
      content:
        `Premium items between ₹400 and ₹600: ` +
        `Margherita Pizza ₹420, Chicken Alfredo Pasta ₹450, ` +
        `Wood-fired Chicken Pizza ₹520, Tiramisu ₹250. ` +
        `Mostly Italian mains. Our Margherita Pizza is the most popular in this range. ` +
        `These items push your cart closer to the ₹500 offer threshold (10% off). ` +
        `Pizza aur pasta ke options: ₹420 se ₹520 tak.`,
      metadata: {
        restaurantId: 1,
        priceRange: '400_600',
        minPrice: 400,
        maxPrice: 600,
        itemIds: [15, 17, 18, 19],
        priority: 7,
      },
      createdAt: now,
    },
    {
      id: 'offer_threshold_guide',
      type: 'offer_eligibility',
      content:
        `To get 10% off: spend ₹500. Easy combos to hit ₹500: ` +
        `Butter Chicken ₹380 plus Sweet Lassi ₹120 = exactly ₹500, get 10% off! ` +
        `Paneer Butter Masala ₹340 plus Butter Naan ₹90 plus Gulab Jamun ₹150 = ₹580, get 10% off. ` +
        `Margherita Pizza ₹420 plus Soup ₹160 = ₹580, get 10% off. ` +
        `₹500 ka order karo, 10% chhoot pao. Offer threshold: paanchsau rupay.`,
      metadata: {
        restaurantId: 1,
        minCartValue: 500,
        discountValue: 10,
        priority: 9,
      },
      createdAt: now,
    },
    {
      id: 'price_comparison_full',
      type: 'price_comparison',
      content:
        `Our menu from most to least expensive: ` +
        `Wood-fired Chicken Pizza ₹520, Chicken Alfredo ₹450, Margherita Pizza ₹420, ` +
        `Butter Chicken ₹380, Kadhai Chicken ₹360, Amritsari Fish Fry ₹350, ` +
        `Paneer Butter Masala ₹340, Chicken Tikka ₹320, Pasta Arrabbiata ₹320, ` +
        `Paneer Tikka ₹280, Tiramisu ₹250, Sarson Ka Saag ₹260, ` +
        `Dal Makhani ₹220, Bruschetta ₹180, Soup ₹160, Gulab Jamun ₹150, ` +
        `Sweet Lassi ₹120, Makki di Roti ₹100, Butter Naan ₹90.`,
      metadata: {
        restaurantId: 1,
        minPrice: 90,
        maxPrice: 520,
        priority: 7,
      },
      createdAt: now,
    },
  ]
}
