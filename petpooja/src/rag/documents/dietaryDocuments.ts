import type { RagDocument } from '../types'

export function loadDietaryDocuments(): RagDocument[] {
  const now = new Date().toISOString()

  return [
    {
      id: 'dietary_vegetarian_guide',
      type: 'dietary_guide',
      content:
        `All vegetarian items at Tadka and Twist: ` +
        `Paneer Tikka ₹280, Dal Makhani ₹220, Paneer Butter Masala ₹340, ` +
        `Sarson Ka Saag ₹260, Butter Naan ₹90, Sweet Lassi ₹120, Gulab Jamun ₹150, ` +
        `Bruschetta ₹180, Soup del Giorno ₹160, Margherita Pizza ₹420, ` +
        `Pasta Arrabbiata ₹320, Tiramisu ₹250. ` +
        `Total: 12 vegetarian options ranging from ₹90 to ₹420. ` +
        `Best value vegetarian: Dal Makhani (₹220) or Pasta Arrabbiata (₹320). ` +
        `Premium vegetarian: Margherita Pizza (₹420) or Paneer Butter Masala (₹340). ` +
        `Veg items: paneer tikka, dal makhani, butter naan, lassi, gulab jamun, shaakahaari khana.`,
      metadata: {
        restaurantId: 1,
        isVeg: true,
        itemIds: [1, 4, 6, 7, 9, 11, 12, 13, 14, 15, 16, 19],
        minPrice: 90,
        maxPrice: 420,
        priority: 9,
      },
      createdAt: now,
    },
    {
      id: 'dietary_vegan_guide',
      type: 'dietary_guide',
      content:
        `Vegan items (no dairy, no eggs, no meat) at Tadka and Twist: ` +
        `Sarson Ka Saag ₹260, Makki di Roti ₹100, Bruschetta al Pomodoro ₹180, ` +
        `Soup del Giorno ₹160, Pasta Arrabbiata ₹320. ` +
        `Total: 5 vegan options. ` +
        `Note: Dal Makhani contains cream (not vegan). Margherita Pizza contains cheese (not vegan). ` +
        `Best vegan combo: Sarson Ka Saag (₹260) plus Makki di Roti (₹100) = ₹360 — traditional Punjabi. ` +
        `Vegan food: sarson ka saag, makki roti, bruschetta, pasta arrabbiata.`,
      metadata: {
        restaurantId: 1,
        isVegan: true,
        isVeg: true,
        itemIds: [7, 10, 13, 14, 16],
        priority: 8,
      },
      createdAt: now,
    },
    {
      id: 'dietary_nonveg_guide',
      type: 'dietary_guide',
      content:
        `Non-vegetarian items at Tadka and Twist: ` +
        `Chicken Tikka ₹320, Amritsari Fish Fry ₹350, Butter Chicken ₹380, ` +
        `Kadhai Chicken ₹360, Chicken Alfredo Pasta ₹450, Wood-fired Chicken Pizza ₹520. ` +
        `Total: 6 non-veg options. All contain chicken or fish. ` +
        `Best seller: Butter Chicken (₹380) — our most ordered non-veg item. ` +
        `Premium non-veg: Wood-fired Chicken Pizza (₹520). ` +
        `Non-veg: butter chicken, chicken tikka, fish fry, kadhai chicken. Maansahaari.`,
      metadata: {
        restaurantId: 1,
        isVeg: false,
        itemIds: [2, 3, 5, 8, 17, 18],
        minPrice: 320,
        maxPrice: 520,
        priority: 8,
      },
      createdAt: now,
    },
    {
      id: 'dietary_jain_guide',
      type: 'dietary_guide',
      content:
        `For Jain dietary requirements: ` +
        `Avoid items with onion and garlic. ` +
        `Safest options: Dal Makhani (can request no onion), Sweet Lassi, Gulab Jamun, Tiramisu. ` +
        `Please inform our kitchen about Jain requirements when ordering. ` +
        `Jain khana: without onion garlic, bina pyaaz lahsun ke.`,
      metadata: {
        restaurantId: 1,
        isVeg: true,
        priority: 5,
      },
      createdAt: now,
    },
    {
      id: 'dietary_allergen_overview',
      type: 'dietary_guide',
      content:
        `Common allergens at Tadka and Twist: ` +
        `Dairy: Paneer Tikka, Butter Chicken, Paneer Butter Masala, Dal Makhani, ` +
        `Butter Naan, Sweet Lassi, Gulab Jamun, Margherita Pizza, Chicken Alfredo, Tiramisu. ` +
        `Gluten: Butter Naan, Bruschetta, both Pizzas, both Pastas. ` +
        `Fish: Amritsari Fish Fry. ` +
        `Egg: Tiramisu (may contain). ` +
        `Nut-free: most items — confirm with kitchen for severe allergies.`,
      metadata: {
        restaurantId: 1,
        priority: 6,
      },
      createdAt: now,
    },
  ]
}
