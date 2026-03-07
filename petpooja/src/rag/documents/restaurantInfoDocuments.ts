import type { RagDocument } from '../types'

export function loadRestaurantInfoDocuments(): RagDocument[] {
  const now = new Date().toISOString()

  return [
    {
      id: 'restaurant_info_basic',
      type: 'restaurant_info',
      content:
        `Tadka and Twist is a restaurant in Ahmedabad, Gujarat. ` +
        `We serve Punjabi and Italian cuisine. ` +
        `Opening hours: 9:00 AM to 11:30 PM, 7 days a week. ` +
        `Ordering channels: voice (phone call), mobile app, walk-in. ` +
        `Tadka and Twist, Ahmedabad — Punjabi aur Italian khana.`,
      metadata: {
        restaurantId: 1,
        name: 'Tadka and Twist',
        priority: 10,
      },
      createdAt: now,
    },
    {
      id: 'restaurant_info_specialty',
      type: 'restaurant_info',
      content:
        `Tadka and Twist is known for: ` +
        `Our authentic Punjabi main courses, especially Butter Chicken and Dal Makhani. ` +
        `Italian classics like Margherita Pizza and Pasta Arrabbiata. ` +
        `Fresh tandoor-grilled starters: Paneer Tikka and Chicken Tikka. ` +
        `Traditional Punjabi desserts: Gulab Jamun. ` +
        `Italian desserts: authentic Tiramisu. ` +
        `Specialty: butter chicken, paneer tikka, dal makhani, margherita pizza, tiramisu.`,
      metadata: {
        restaurantId: 1,
        name: 'Tadka and Twist',
        priority: 9,
      },
      createdAt: now,
    },
    {
      id: 'restaurant_info_ordering',
      type: 'restaurant_info',
      content:
        `How to order at Tadka and Twist: ` +
        `You can order by phone (voice call), via our app, or walk in. ` +
        `Tell us what you'd like, we'll confirm your items, and process your order. ` +
        `We accept modifications like extra butter, less spice, no onion. ` +
        `Payment options available at the restaurant. ` +
        `Order karne ke liye: phone karein, app use karein, ya seedha aayein.`,
      metadata: {
        restaurantId: 1,
        name: 'Tadka and Twist',
        priority: 7,
      },
      createdAt: now,
    },
    {
      id: 'restaurant_info_faq',
      type: 'restaurant_info',
      content:
        `Frequently asked questions at Tadka and Twist: ` +
        `Q: Do you have vegan options? A: Yes — Sarson Ka Saag, Pasta Arrabbiata, Bruschetta, and more. ` +
        `Q: What's your cheapest item? A: Butter Naan at ₹90. ` +
        `Q: What's your most popular dish? A: Butter Chicken. ` +
        `Q: Do you have combo offers? A: Yes — Butter Chicken plus Naan, Italian pizza plus pasta combos. ` +
        `Q: Are there discounts? A: Yes — 10% off above ₹500, 20% off above ₹900. ` +
        `Sabse sasta: Butter Naan ₹90. Sabse popular: Butter Chicken.`,
      metadata: {
        restaurantId: 1,
        name: 'Tadka and Twist',
        priority: 9,
      },
      createdAt: now,
    },
  ]
}
