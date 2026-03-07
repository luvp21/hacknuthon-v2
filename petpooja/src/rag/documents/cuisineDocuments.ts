import type { RagDocument } from '../types'

export function loadCuisineDocuments(): RagDocument[] {
  const now = new Date().toISOString()

  return [
    {
      id: 'cuisine_overview_punjabi',
      type: 'cuisine_overview',
      content:
        `Tadka and Twist serves authentic Punjabi cuisine including: ` +
        `Starters: Paneer Tikka (₹280, veg), Chicken Tikka (₹320), Amritsari Fish Fry (₹350). ` +
        `Mains: Butter Chicken (₹380), Paneer Butter Masala (₹340), Sarson Ka Saag (₹260, vegan), ` +
        `Dal Makhani (₹220, veg), Kadhai Chicken (₹360). ` +
        `Breads: Butter Naan (₹90, veg), Makki di Roti (₹100, vegan). ` +
        `Desserts: Gulab Jamun (₹150, veg). Beverages: Sweet Lassi (₹120, veg). ` +
        `Punjabi items range from ₹90 to ₹380. ` +
        `Best Punjabi sellers: Butter Chicken, Butter Naan, Paneer Tikka. ` +
        `Punjabi khana: dal makhani, butter chicken, paneer tikka, sarson ka saag, lassi, gulab jamun.`,
      metadata: {
        restaurantId: 1,
        cuisine: 'Punjabi',
        itemIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        minPrice: 90,
        maxPrice: 380,
        priority: 9,
      },
      createdAt: now,
    },
    {
      id: 'cuisine_overview_italian',
      type: 'cuisine_overview',
      content:
        `Our Italian menu features: ` +
        `Starters: Bruschetta al Pomodoro (₹180, vegan), Soup del Giorno (₹160, vegan). ` +
        `Mains: Margherita Pizza (₹420, veg), Pasta Arrabbiata (₹320, vegan), ` +
        `Chicken Alfredo Pasta (₹450), Wood-fired Chicken Pizza (₹520). ` +
        `Desserts: Tiramisu (₹250, veg). ` +
        `Italian items range from ₹160 to ₹520. ` +
        `Best Italian sellers: Margherita Pizza, Pasta Arrabbiata. ` +
        `Italian food: pizza, pasta arrabbiata, bruschetta, tiramisu, alfredo.`,
      metadata: {
        restaurantId: 1,
        cuisine: 'Italian',
        itemIds: [13, 14, 15, 16, 17, 18, 19],
        minPrice: 160,
        maxPrice: 520,
        priority: 9,
      },
      createdAt: now,
    },
    {
      id: 'restaurant_info_overview',
      type: 'restaurant_info',
      content:
        `Tadka and Twist is a restaurant in Ahmedabad serving Punjabi and Italian cuisine. ` +
        `Open from 9:00 AM to 11:30 PM. ` +
        `Total menu: 19 items. 12 vegetarian items. 5 vegan items. 7 non-vegetarian items. ` +
        `Price range: ₹90 (Butter Naan) to ₹520 (Wood-fired Chicken Pizza). ` +
        `Ordering channels: voice call, app, walk-in. ` +
        `Current offers: 10% off above ₹500, 20% off above ₹900. ` +
        `Ahmedabad mein best Punjabi aur Italian restaurant.`,
      metadata: {
        restaurantId: 1,
        name: 'Tadka and Twist',
        cuisine: 'both',
        priority: 10,
      },
      createdAt: now,
    },
    {
      id: 'cuisine_dietary_comparison',
      type: 'dietary_guide',
      content:
        `If you prefer vegetarian food, our Punjabi menu has great options: ` +
        `Paneer Tikka, Dal Makhani, Paneer Butter Masala, Sarson Ka Saag, Butter Naan. ` +
        `For vegan options: Sarson Ka Saag, Makki di Roti, Bruschetta, Soup del Giorno, Pasta Arrabbiata. ` +
        `For non-vegetarian: Butter Chicken, Chicken Tikka, Amritsari Fish Fry, ` +
        `Kadhai Chicken, Chicken Alfredo, Wood-fired Chicken Pizza. ` +
        `Italian options are generally priced higher than Punjabi options. ` +
        `Shaakahaari: paneer, dal, lassi, naan, gulab jamun. Maansahaari: chicken, fish.`,
      metadata: {
        restaurantId: 1,
        cuisine: 'both',
        isVeg: true,
        priority: 8,
      },
      createdAt: now,
    },
  ]
}
