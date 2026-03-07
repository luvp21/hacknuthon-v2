import { query } from '../../database/postgres'
import type { RagDocument } from '../types'

interface InventoryRow {
  item_id: number
  restaurant_id: number
  current_remaining: number
  max_servings: number
  name: string
  selling_price: string
  is_veg: boolean
  cuisine: string
}

export async function loadInventoryDocuments(): Promise<RagDocument[]> {
  try {
    const result = await query<InventoryRow>(
      `SELECT i.item_id, i.restaurant_id, i.current_remaining, i.max_servings,
              m.name, m.selling_price, m.is_veg, m.cuisine
       FROM inventory i
       JOIN menu_items m ON m.item_id = i.item_id
       WHERE i.restaurant_id = 1 AND i.item_id != 20`
    )

    const docs: RagDocument[] = []
    const lowStockItems: Array<{ name: string; remaining: number; itemId: number }> = []
    const wellStockedItems: string[] = []

    for (const row of result.rows) {
      const stockPct = row.max_servings > 0 ? row.current_remaining / row.max_servings : 0
      const isLowStock = stockPct < 0.2

      let stockDesc: string
      if (stockPct >= 0.5) {
        stockDesc = 'Well stocked — no concerns.'
        wellStockedItems.push(row.name)
      } else if (stockPct >= 0.2) {
        stockDesc = 'Stock is moderate.'
      } else {
        stockDesc = `Running LOW on stock — only ${row.current_remaining} left! Suggest ordering soon.`
        lowStockItems.push({ name: row.name, remaining: row.current_remaining, itemId: row.item_id })
      }

      docs.push({
        id: `inventory_${row.item_id}`,
        type: 'inventory',
        content:
          `${row.name} currently has ${row.current_remaining} servings available ` +
          `out of a maximum of ${row.max_servings} for today. ${stockDesc}`,
        metadata: {
          restaurantId: row.restaurant_id,
          itemId: row.item_id,
          name: row.name,
          currentStock: row.current_remaining,
          isLowStock,
          isAvailable: row.current_remaining > 0,
          sellingPrice: parseFloat(row.selling_price),
          isVeg: row.is_veg,
          cuisine: row.cuisine,
          priority: isLowStock ? 8 : 4,
        },
        createdAt: new Date().toISOString(),
      })
    }

    // Grouped low-stock alert
    if (lowStockItems.length > 0) {
      const listText = lowStockItems
        .map((i) => `${i.name} (${i.remaining} remaining)`)
        .join(', ')
      docs.push({
        id: 'inventory_low_stock_alert',
        type: 'inventory',
        content:
          `Low stock alert for today: The following items are running low: ${listText}. ` +
          `Avoid heavily promoting these items. Suggest alternatives if customer asks.`,
        metadata: {
          restaurantId: 1,
          itemIds: lowStockItems.map((i) => i.itemId),
          isLowStock: true,
          priority: 7,
        },
        createdAt: new Date().toISOString(),
      })
    }

    // Well-stocked highlights
    if (wellStockedItems.length > 0) {
      docs.push({
        id: 'inventory_well_stocked',
        type: 'inventory',
        content:
          `Items with excellent availability today: ${wellStockedItems.join(', ')}. ` +
          `These can be freely recommended without stock concerns.`,
        metadata: {
          restaurantId: 1,
          isLowStock: false,
          priority: 3,
        },
        createdAt: new Date().toISOString(),
      })
    }

    return docs
  } catch {
    return []
  }
}
