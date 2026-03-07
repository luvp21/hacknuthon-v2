/**
 * Menu Document Loader + Retriever (RAG)
 *
 * Implements the RAG pattern for menu access:
 *   - DocumentLoader: reads menu knowledge base from a static JSON file
 *   - Retriever:      callers use MenuMatcher (Fuse.js) to retrieve relevant items
 *
 * This eliminates direct DB queries for menu data, making the menu
 * available even when the DB schema is being migrated or reset.
 */

import * as path from 'path';
import * as fs from 'fs';
import { MenuItem, MenuCategory } from '../types';

// ── Document schema ────────────────────────────────────────────────────────────

interface MenuDocument {
    restaurants: Record<string, { name: string; cuisine_type: string }>;
    categories: Record<string, MenuCategory[]>;
    items: MenuItem[];
}

// ── In-process document cache ─────────────────────────────────────────────────

let _document: MenuDocument | null = null;

/**
 * Load the menu JSON document from disk (cached after first read).
 * This is the "document loading" step in the RAG pipeline.
 */
function loadDocument(): MenuDocument {
    if (_document) return _document;

    const dataPath = path.resolve(__dirname, 'data', 'menu_data.json');
    const raw = fs.readFileSync(dataPath, 'utf-8');
    const parsed = JSON.parse(raw) as MenuDocument;

    // Hydrate ISO date strings → Date objects
    parsed.items = parsed.items.map((item) => ({
        ...item,
        created_at: new Date(item.created_at as unknown as string),
        updated_at: new Date(item.updated_at as unknown as string),
    }));

    _document = parsed;
    return _document;
}

// ── Public retriever functions ────────────────────────────────────────────────

/**
 * Retrieve all available menu items for a restaurant.
 * Equivalent to SELECT * FROM menu_items WHERE restaurant_id = ? AND is_available = TRUE
 */
export function getDocumentMenuItems(restaurantId: string): MenuItem[] {
    const doc = loadDocument();
    return doc.items.filter(
        (item) => item.restaurant_id === restaurantId && item.is_available
    );
}

/**
 * Retrieve a single menu item by ID.
 * Returns null if not found.
 */
export function getDocumentMenuItem(itemId: string): MenuItem | null {
    const doc = loadDocument();
    return doc.items.find((item) => item.id === itemId) ?? null;
}

/**
 * Retrieve all available categories for a restaurant.
 */
export function getDocumentCategories(restaurantId: string): MenuCategory[] {
    const doc = loadDocument();
    return (doc.categories[restaurantId] ?? []).filter((c) => c.is_available);
}

/**
 * Retrieve the restaurant display name.
 */
export function getDocumentRestaurantName(restaurantId: string): string {
    const doc = loadDocument();
    return doc.restaurants[restaurantId]?.name ?? 'Restaurant';
}

/**
 * Invalidate the in-process document cache so the next call re-reads from disk.
 * Call this if menu_data.json is updated at runtime.
 */
export function invalidateDocumentCache(): void {
    _document = null;
}
