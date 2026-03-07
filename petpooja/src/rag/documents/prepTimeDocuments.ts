import type { RagDocument } from '../types'

export function loadPrepTimeDocuments(): RagDocument[] {
  const now = new Date().toISOString()

  return [
    {
      id: 'prep_time_fast',
      type: 'prep_time',
      content:
        `Quick items ready in 10 minutes or less: ` +
        `Bruschetta al Pomodoro (10 min, ₹180), Soup del Giorno (10 min, ₹160), ` +
        `Sweet Lassi (5 min, ₹120), Gulab Jamun (5 min, ₹150), Tiramisu (5 min, ₹250), ` +
        `Butter Naan (10 min, ₹90). ` +
        `Perfect if you're in a hurry or want a quick starter or dessert. ` +
        `Jaldi milne wale items: lassi, gulab jamun, naan, tiramisu. ` +
        `Fast food ready in 5-10 minutes.`,
      metadata: {
        restaurantId: 1,
        itemIds: [13, 14, 11, 12, 19, 9],
        priority: 6,
      },
      createdAt: now,
    },
    {
      id: 'prep_time_medium',
      type: 'prep_time',
      content:
        `Items ready in 11 to 20 minutes: ` +
        `Paneer Tikka (15 min), Chicken Tikka (18 min), Paneer Butter Masala (18 min), ` +
        `Margherita Pizza (20 min), Butter Chicken (20 min), Pasta Arrabbiata (15 min), ` +
        `Makki di Roti (12 min), Chicken Alfredo (18 min). ` +
        `Standard wait time for most main courses. ` +
        `15-20 minute mein ready: paneer tikka, butter chicken, pizza, pasta.`,
      metadata: {
        restaurantId: 1,
        itemIds: [1, 2, 6, 15, 5, 16, 10, 17],
        priority: 5,
      },
      createdAt: now,
    },
    {
      id: 'prep_time_slow',
      type: 'prep_time',
      content:
        `Items that take more than 20 minutes: ` +
        `Amritsari Fish Fry (20 min), Kadhai Chicken (22 min), ` +
        `Wood-fired Chicken Pizza (22 min), Sarson Ka Saag (30 min), Dal Makhani (25 min). ` +
        `These are freshly prepared — worth the wait! ` +
        `Dal Makhani is slow-cooked for authentic flavour. ` +
        `Thoda time lagega: sarson ka saag, dal makhani, kadhai chicken.`,
      metadata: {
        restaurantId: 1,
        itemIds: [3, 8, 18, 7, 4],
        priority: 5,
      },
      createdAt: now,
    },
  ]
}
