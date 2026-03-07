import { query } from '../../database/postgres'
import type { RagDocument } from '../types'

interface MenuRow {
  item_id: number
  restaurant_id: number
  name: string
  cuisine: string
  description: string
  selling_price: string
  prev_price: string | null
  food_cost: string
  is_veg: boolean
  is_vegan: boolean
  is_available: boolean
  prep_time_min: number
  current_remaining: number | null
  max_servings: number | null
  restaurant_name: string
}

function deriveCategory(name: string, description: string): string {
  const lower = (name + ' ' + description).toLowerCase()
  if (/tikka|fry|bruschetta|soup/.test(lower)) return 'starter'
  if (/naan|roti/.test(lower)) return 'bread'
  if (/lassi/.test(lower)) return 'beverage'
  if (/gulab|tiramisu/.test(lower)) return 'dessert'
  if (/chicken|masala|saag|pasta|pizza|alfredo|kadhai|dal|makhani|butter chicken|paneer butter/.test(lower)) return 'main'
  return 'main'
}

function derivePriceRange(price: number): string {
  if (price < 200) return 'under_200'
  if (price < 400) return '200_400'
  if (price < 600) return '400_600'
  return 'above_600'
}

function hindiHints(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('paneer tikka')) return 'paneer tikka, टिक्का, cottage cheese starter'
  if (n.includes('butter chicken')) return 'butter chicken, मक्खन चिकन, murgh makhani'
  if (n.includes('dal makhani')) return 'dal makhani, दाल मखनी, black lentils'
  if (n.includes('sarson')) return 'sarson ka saag, सरसों का साग, mustard greens'
  if (n.includes('lassi')) return 'lassi, लस्सी, yoghurt drink'
  if (n.includes('gulab')) return 'gulab jamun, गुलाब जामुन, mithai, dessert'
  if (n.includes('naan')) return 'naan, bread, रोटी, tandoor bread'
  if (n.includes('makki')) return 'makki roti, मक्की रोटी, cornmeal bread'
  if (n.includes('chicken tikka')) return 'chicken tikka, चिकन टिक्का, grilled chicken'
  if (n.includes('fish')) return 'amritsari fish, मछली, fish fry'
  if (n.includes('kadhai')) return 'kadhai chicken, कढ़ाई चिकन, wok chicken'
  if (n.includes('paneer butter') || n.includes('butter masala')) return 'paneer butter masala, पनीर मक्खन, shahi paneer'
  if (n.includes('bruschetta')) return 'bruschetta, ब्रूसकेटा, Italian toast starter'
  if (n.includes('margherita')) return 'margherita pizza, मार्गरीटा पिज्जा, classic cheese pizza'
  if (n.includes('arrabbiata') || n.includes('pasta')) return 'pasta arrabbiata, पास्ता, spicy pasta'
  if (n.includes('alfredo')) return 'chicken alfredo, क्रीमी पास्ता, creamy pasta'
  if (n.includes('wood') || n.includes('wood-fired')) return 'wood fired pizza, बारबेक्यू पिज्जा, chicken pizza'
  if (n.includes('tiramisu')) return 'tiramisu, तिरामिसू, Italian dessert'
  if (n.includes('soup')) return 'soup, सूप, Italian soup'
  return ''
}

export async function loadMenuDocuments(): Promise<RagDocument[]> {
  try {
    const result = await query<MenuRow>(
      `SELECT m.item_id, m.restaurant_id, m.name, m.cuisine, m.description,
              m.selling_price, m.prev_price, m.food_cost,
              m.is_veg, m.is_vegan, m.is_available,
              m.prep_time_min,
              i.current_remaining, i.max_servings,
              r.name AS restaurant_name
       FROM menu_items m
       JOIN restaurants r ON r.restaurant_id = m.restaurant_id
       LEFT JOIN inventory i ON i.item_id = m.item_id AND i.restaurant_id = m.restaurant_id
       WHERE m.item_id != 20 AND m.is_available = true`
    )

    const docs: RagDocument[] = []
    const rows = result.rows

    for (const row of rows) {
      const price = parseFloat(row.selling_price)
      const prevPrice = row.prev_price ? parseFloat(row.prev_price) : null
      const category = deriveCategory(row.name, row.description)
      const priceRange = derivePriceRange(price)
      const currentRemaining = row.current_remaining ?? 0
      const maxServings = row.max_servings ?? 0
      const isLowStock = maxServings > 0 && currentRemaining / maxServings < 0.2
      const hints = hindiHints(row.name)

      const vegLabel = row.is_veg ? 'Vegetarian.' : 'Non-vegetarian.'
      const veganLabel = row.is_vegan ? ' Also vegan.' : ''
      const prevPriceText = prevPrice ? ` Previously priced at ₹${prevPrice}.` : ''

      const content1 =
        `[ItemID:${row.item_id}] ${row.name} is a ${row.cuisine} ${category} priced at ₹${price}. ` +
        `${row.description}. ` +
        `${vegLabel}${veganLabel} ` +
        `Available now. Takes about ${row.prep_time_min} minutes to prepare.` +
        `${prevPriceText}` +
        (hints ? ` ${hints}` : '')

      docs.push({
        id: `menu_item_${row.item_id}`,
        type: 'menu_item',
        content: content1,
        metadata: {
          restaurantId: row.restaurant_id,
          itemId: row.item_id,
          name: row.name,
          sellingPrice: price,
          foodCost: parseFloat(row.food_cost),
          isVeg: row.is_veg,
          isVegan: row.is_vegan,
          isAvailable: row.is_available,
          cuisine: row.cuisine,
          category,
          priceRange,
          currentStock: currentRemaining,
          isLowStock,
          keywords: [row.name.toLowerCase(), row.cuisine.toLowerCase(), category],
          language: ['en', 'hi', 'hinglish'],
          priority: 8,
        },
        createdAt: new Date().toISOString(),
      })

      const stockText =
        currentRemaining / maxServings >= 0.5
          ? 'Well stocked — no concerns.'
          : currentRemaining / maxServings >= 0.2
            ? 'Stock is moderate.'
            : `Running low — only ${currentRemaining} left! Suggest ordering soon.`

      const veganNote = row.is_vegan ? ', vegans' : ''
      const content2 =
        `[ItemID:${row.item_id}] ${row.name} details: serves as a ${category} in our ${row.cuisine} section. ` +
        `Food cost is ₹${parseFloat(row.food_cost)}, priced at ₹${price}. ` +
        `${currentRemaining} servings remaining today out of ${maxServings} maximum. ` +
        `${stockText} ` +
        `Suitable for: ${row.is_veg ? 'vegetarians' : 'non-vegetarians'}${veganNote}. ` +
        `Cuisine: ${row.cuisine}. Prep time: ${row.prep_time_min} minutes.`

      docs.push({
        id: `menu_item_detail_${row.item_id}`,
        type: 'menu_item_detail',
        content: content2,
        metadata: {
          restaurantId: row.restaurant_id,
          itemId: row.item_id,
          name: row.name,
          sellingPrice: price,
          foodCost: parseFloat(row.food_cost),
          isVeg: row.is_veg,
          isVegan: row.is_vegan,
          isAvailable: row.is_available,
          cuisine: row.cuisine,
          category,
          priceRange,
          currentStock: currentRemaining,
          isLowStock,
          keywords: [row.name.toLowerCase(), row.cuisine.toLowerCase(), category],
          language: ['en', 'hi', 'hinglish'],
          priority: 6,
        },
        createdAt: new Date().toISOString(),
      })
    }

    return docs
  } catch {
    return []
  }
}
