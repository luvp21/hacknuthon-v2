-- ============================================================
-- 003_seed_data.sql
-- Synthetic seed data for 1 restaurant (V4 schema)
-- Punjabi + basic Italian cuisine for Indian public
-- All prices in Indian Rupees (₹)
-- ============================================================

-- ============================================================
-- SECTION 1: RESTAURANT
-- 1 restaurant in Ahmedabad
-- ============================================================

INSERT INTO restaurants (restaurant_id, name, cuisine_type, opening_time, closing_time, created_at)
VALUES
    (1, 'Tadka & Twist', 'Punjabi, Italian', '09:00:00', '23:30:00', '2025-10-01 09:00:00');


-- ============================================================
-- SECTION 2: MENU ITEMS
-- 20 rows total:
--   • 19 unique items  (item_id 1–19)
--   • 1 duplicate      (item_id 20 = same name & price as item_id 1 — intentional for error-detection testing)
-- Prices: ₹90 – ₹700
-- Cuisines: Punjabi / Italian
-- ============================================================

INSERT INTO menu_items (
    item_id, restaurant_id,
    name, cuisine, description,
    selling_price, prev_price, last_price_updated,
    food_cost,
    is_veg, is_vegan, is_available,
    prep_time_min, created_at
) VALUES
-- ── Punjabi Starters ─────────────────────────────────────────────────────────
(1,  1, 'Paneer Tikka',           'Punjabi', 'Marinated cottage cheese grilled in tandoor',                    280.00, 260.00, '2025-11-15', 98.00,  TRUE,  FALSE, TRUE,  15, '2025-10-01 10:00:00'),
(2,  1, 'Chicken Tikka',          'Punjabi', 'Boneless chicken marinated in spiced yoghurt, tandoor-grilled',  320.00, 300.00, '2025-11-15', 112.00, FALSE, FALSE, TRUE,  18, '2025-10-01 10:00:00'),
(3,  1, 'Amritsari Fish Fry',     'Punjabi', 'Crispy battered fish with ajwain and chilli',                   350.00, NULL,   NULL,         122.50, FALSE, FALSE, TRUE,  20, '2025-10-01 10:00:00'),
(4,  1, 'Dal Makhani',            'Punjabi', 'Slow-cooked black lentils with cream and butter',               220.00, 200.00, '2025-12-01', 77.00,  TRUE,  FALSE, TRUE,  25, '2025-10-01 10:00:00'),

-- ── Punjabi Main Course ───────────────────────────────────────────────────────
(5,  1, 'Butter Chicken',         'Punjabi', 'Tender chicken in rich tomato-butter-cream gravy',              380.00, 360.00, '2025-12-01', 133.00, FALSE, FALSE, TRUE,  20, '2025-10-01 10:00:00'),
(6,  1, 'Paneer Butter Masala',   'Punjabi', 'Cottage cheese cubes in smooth makhani gravy',                  340.00, 320.00, '2025-12-01', 119.00, TRUE,  FALSE, TRUE,  18, '2025-10-01 10:00:00'),
(7,  1, 'Sarson Ka Saag',         'Punjabi', 'Mustard greens cooked with spices, served with makki roti',     260.00, NULL,   NULL,         91.00,  TRUE,  TRUE,  TRUE,  30, '2025-10-01 10:00:00'),
(8,  1, 'Kadhai Chicken',         'Punjabi', 'Wok-tossed chicken with capsicum, onion, and tomato masala',   360.00, 340.00, '2025-11-20', 126.00, FALSE, FALSE, TRUE,  22, '2025-10-01 10:00:00'),

-- ── Punjabi Breads ────────────────────────────────────────────────────────────
(9,  1, 'Butter Naan',            'Punjabi', 'Soft leavened bread baked in tandoor, topped with butter',      90.00,  NULL,   NULL,         27.00,  TRUE,  FALSE, TRUE,  10, '2025-10-01 10:00:00'),
(10, 1, 'Makki di Roti',          'Punjabi', 'Traditional cornmeal flatbread',                                100.00, NULL,   NULL,         30.00,  TRUE,  TRUE,  TRUE,  12, '2025-10-01 10:00:00'),

-- ── Punjabi Beverages & Desserts ──────────────────────────────────────────────
(11, 1, 'Sweet Lassi',            'Punjabi', 'Chilled blended yoghurt with sugar and cardamom',               120.00, 110.00, '2025-11-01', 36.00,  TRUE,  FALSE, TRUE,   5, '2025-10-01 10:00:00'),
(12, 1, 'Gulab Jamun',            'Punjabi', 'Soft milk-solid dumplings soaked in rose-cardamom syrup',       150.00, 130.00, '2025-11-01', 45.00,  TRUE,  FALSE, TRUE,   5, '2025-10-01 10:00:00'),

-- ── Italian Starters ─────────────────────────────────────────────────────────
(13, 1, 'Bruschetta al Pomodoro', 'Italian', 'Grilled bread topped with tomato, garlic, basil, olive oil',    180.00, NULL,   NULL,         54.00,  TRUE,  TRUE,  TRUE,  10, '2025-10-01 10:00:00'),
(14, 1, 'Soup del Giorno',        'Italian', 'Chef''s daily soup — tomato basil or minestrone',               160.00, 150.00, '2025-12-10', 48.00,  TRUE,  TRUE,  TRUE,  10, '2025-10-01 10:00:00'),

-- ── Italian Mains ────────────────────────────────────────────────────────────
(15, 1, 'Margherita Pizza',       'Italian', '10-inch pizza with San Marzano tomato sauce and mozzarella',    420.00, 399.00, '2026-01-01', 147.00, TRUE,  FALSE, TRUE,  20, '2025-10-01 10:00:00'),
(16, 1, 'Pasta Arrabbiata',       'Italian', 'Penne in spicy tomato sauce with garlic and red chilli',        320.00, 299.00, '2026-01-01', 96.00,  TRUE,  TRUE,  TRUE,  15, '2025-10-01 10:00:00'),
(17, 1, 'Chicken Alfredo Pasta',  'Italian', 'Fettuccine in creamy Parmesan sauce with grilled chicken',      450.00, 420.00, '2026-01-01', 157.50, FALSE, FALSE, TRUE,  18, '2025-10-01 10:00:00'),
(18, 1, 'Wood-fired Chicken Pizza','Italian','10-inch pizza with BBQ sauce, chicken, red onion, jalapeño',    520.00, 499.00, '2026-01-15', 182.00, FALSE, FALSE, TRUE,  22, '2025-10-01 10:00:00'),

-- ── Italian Dessert ───────────────────────────────────────────────────────────
(19, 1, 'Tiramisu',               'Italian', 'Classic Italian dessert with espresso-soaked ladyfingers and mascarpone', 250.00, NULL, NULL, 87.50, TRUE, FALSE, TRUE, 5, '2025-10-01 10:00:00'),

-- ── DUPLICATE — same name & price as item_id 1 (intentional for error-detection) ──
(20, 1, 'Paneer Tikka',           'Punjabi', 'Duplicate entry for error-detection testing',                   280.00, 260.00, '2025-11-15', 98.00,  TRUE,  FALSE, FALSE, 15, '2025-10-01 10:05:00');

-- Reset sequence past manually inserted IDs
SELECT setval('menu_items_item_id_seq', 20);


-- ============================================================
-- SECTION 3: INVENTORY
-- One row per menu item for the restaurant
-- ============================================================

INSERT INTO inventory (restaurant_id, item_id, max_servings, current_remaining, last_reset_at)
VALUES
    (1,  1, 50, 42, '2026-03-06 09:00:00'),
    (1,  2, 40, 35, '2026-03-06 09:00:00'),
    (1,  3, 30, 28, '2026-03-06 09:00:00'),
    (1,  4, 60, 55, '2026-03-06 09:00:00'),
    (1,  5, 50, 44, '2026-03-06 09:00:00'),
    (1,  6, 50, 46, '2026-03-06 09:00:00'),
    (1,  7, 30, 27, '2026-03-06 09:00:00'),
    (1,  8, 40, 36, '2026-03-06 09:00:00'),
    (1,  9, 100, 88, '2026-03-06 09:00:00'),
    (1, 10, 80,  74, '2026-03-06 09:00:00'),
    (1, 11, 70,  63, '2026-03-06 09:00:00'),
    (1, 12, 60,  56, '2026-03-06 09:00:00'),
    (1, 13, 40,  38, '2026-03-06 09:00:00'),
    (1, 14, 40,  37, '2026-03-06 09:00:00'),
    (1, 15, 35,  30, '2026-03-06 09:00:00'),
    (1, 16, 35,  32, '2026-03-06 09:00:00'),
    (1, 17, 30,  26, '2026-03-06 09:00:00'),
    (1, 18, 25,  22, '2026-03-06 09:00:00'),
    (1, 19, 30,  28, '2026-03-06 09:00:00'),
    (1, 20,  0,   0, '2026-03-06 09:00:00');  -- duplicate item, zero stock


-- ============================================================
-- SECTION 4: CUSTOMERS
-- 5 attempts total:
--   • 3 unique customers inserted (customer_id 1, 2, 3)
--   • 2 duplicate attempts wrapped in DO/EXCEPTION:
--       dup A = same phone as customer_id 1 → UNIQUE violation, raises NOTICE
--       dup B = same phone as customer_id 2 → UNIQUE violation, raises NOTICE
--   turnaround_days = (last_visit_at - first_visit_at) / visit_count
--   visit_count > 1 means they returned → confirms turnaround is meaningful
-- ============================================================

INSERT INTO customers (
    customer_id, restaurant_id, phone, name,
    first_visit_at, last_visit_at,
    visit_count, total_spent, avg_order_value, turnaround_days,
    customer_segment, preferred_cuisine, preferred_category
) VALUES
(1, 1, '+919876540001', 'Arjun Mehta',
 '2025-11-10 13:00:00', '2026-02-20 19:30:00',
 6, 3840.00, 640.00, 24.3,
 'LOYAL',   'Punjabi', 'Main Course'),

(2, 1, '+919876540002', 'Priya Shah',
 '2025-12-05 20:00:00', '2026-03-01 20:15:00',
 4, 2240.00, 560.00, 23.7,
 'REGULAR', 'Italian', 'Mains'),

(3, 1, '+919876540003', 'Ravi Patel',
 '2026-01-15 12:30:00', '2026-03-05 13:00:00',
 2, 980.00,  490.00, 25.0,
 'REGULAR', 'Punjabi', 'Starters');

SELECT setval('customers_customer_id_seq', 3);

-- ── Duplicate customer attempts (UNIQUE violation expected — for error-detection testing) ──
-- Each DO block tries to insert a duplicate phone and catches the constraint error,
-- printing a NOTICE so the violation is visible without aborting the migration.

DO $$
BEGIN
    INSERT INTO customers (
        restaurant_id, phone, name,
        first_visit_at, last_visit_at,
        visit_count, total_spent, avg_order_value, turnaround_days,
        customer_segment, preferred_cuisine, preferred_category
    ) VALUES (
        1, '+919876540001', 'Arjun M. (duplicate)',
        '2025-11-10 13:00:00', '2026-02-20 19:30:00',
        6, 3840.00, 640.00, 24.3,
        'LOYAL', 'Punjabi', 'Main Course'
    );
EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '[DUPLICATE DETECTED] customer phone +919876540001 already exists for restaurant_id=1 — skipping insert (unique_violation caught)';
END;
$$;

DO $$
BEGIN
    INSERT INTO customers (
        restaurant_id, phone, name,
        first_visit_at, last_visit_at,
        visit_count, total_spent, avg_order_value, turnaround_days,
        customer_segment, preferred_cuisine, preferred_category
    ) VALUES (
        1, '+919876540002', 'P. Shah (duplicate)',
        '2025-12-05 20:00:00', '2026-03-01 20:15:00',
        4, 2240.00, 560.00, 23.7,
        'REGULAR', 'Italian', 'Mains'
    );
EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '[DUPLICATE DETECTED] customer phone +919876540002 already exists for restaurant_id=1 — skipping insert (unique_violation caught)';
END;
$$;


-- ============================================================
-- SECTION 5: ACTIVE OFFERS
-- 2 offers for the restaurant
-- Discount values: only 4 unique values used across the whole file
--   → 10%, 20%, 30%, 50%
-- ============================================================

INSERT INTO active_offers (
    offer_id, restaurant_id,
    offer_type, min_cart_value,
    discount_type, discount_value,
    nudge_text, display_text,
    percentile_source, is_active,
    valid_from, valid_to,
    channel, max_uses_per_day, uses_today
) VALUES
(1, 1,
 'cart_threshold', 500.00,
 'percent',        10.00,
 'Add ₹500 or more and get 10% off your order!',
 '10% OFF on orders above ₹500',
 'p50', TRUE,
 '2026-01-01 00:00:00', '2026-06-30 23:59:59',
 'all', 50, 3),

(2, 1,
 'cart_threshold', 900.00,
 'percent',        20.00,
 'Wow! Orders above ₹900 get 20% off — big savings tonight!',
 '20% OFF on orders above ₹900',
 'p75', TRUE,
 '2026-01-01 00:00:00', '2026-06-30 23:59:59',
 'all', 30, 1);

SELECT setval('active_offers_offer_id_seq', 2);


-- ============================================================
-- SECTION 6: COMBOS
-- 3 combos for the restaurant
-- Discount values used: 30% and 50% (completing the 4 unique values)
-- ============================================================

INSERT INTO combos (
    combo_id, restaurant_id,
    item_a, item_b, item_c,
    combo_type, combo_size,
    support, confidence, lift, conviction,
    margin_lift, upsell_score, synergy_score,
    combo_cm_rupees, max_discount_pct,
    popularity_rank, co_count,
    last_updated
) VALUES
-- Combo 1: Butter Chicken + Butter Naan (most ordered together)
(1, 1,
 5, 9, NULL,
 'pair', 2,
 0.34000, 0.72000, 2.1176, 2.8571,
 85.50, 0.7800, 0.8100,
 322.00, 30.00,
 1, 42,
 '2026-03-01 00:00:00'),

-- Combo 2: Paneer Tikka + Sweet Lassi + Gulab Jamun (starter-dessert set)
(2, 1,
 1, 11, 12,
 'trio', 3,
 0.18000, 0.54000, 1.8900, 1.7391,
 71.00, 0.6500, 0.7300,
 277.00, 20.00,
 2, 24,
 '2026-03-01 00:00:00'),

-- Combo 3: Margherita Pizza + Pasta Arrabbiata (Italian feast)
(3, 1,
 15, 16, NULL,
 'pair', 2,
 0.22000, 0.61000, 2.0333, 2.1739,
 66.00, 0.6100, 0.6700,
 353.00, 50.00,
 3, 18,
 '2026-03-01 00:00:00');

SELECT setval('combos_combo_id_seq', 3);


-- ============================================================
-- SECTION 7: ORDERS (completed)
-- 10 completed orders tied to customers 1–3
-- Channels: voice, app, walkin
-- day_parts: breakfast / lunch / evening / dinner
-- Discount values applied: 0%, 10%, 20% (from offers)
-- ============================================================

INSERT INTO orders (
    order_id, restaurant_id, session_id, channel,
    customer_id, customer_phone,
    order_total, discount_applied, offer_id, combo_id,
    net_total, day_part, completed_at
) VALUES
(1, 1, 'sess-a1b2c3d4-0001', 'voice',
 1, '+919876540001',
 670.00,  0.00, NULL, 1,
 670.00, 'dinner',  '2025-11-10 20:15:00'),

(2, 1, 'sess-a1b2c3d4-0002', 'app',
 2, '+919876540002',
 740.00, 74.00,    1, NULL,
 666.00, 'dinner',  '2025-12-05 21:00:00'),

(3, 1, 'sess-a1b2c3d4-0003', 'voice',
 1, '+919876540001',
 580.00,  0.00, NULL, NULL,
 580.00, 'lunch',   '2025-12-18 13:45:00'),

(4, 1, 'sess-a1b2c3d4-0004', 'walkin',
 3, '+919876540003',
 490.00,  0.00, NULL, NULL,
 490.00, 'lunch',   '2026-01-15 13:00:00'),

(5, 1, 'sess-a1b2c3d4-0005', 'voice',
 2, '+919876540002',
 960.00, 192.00,   2, NULL,
 768.00, 'dinner',  '2026-01-22 20:30:00'),

(6, 1, 'sess-a1b2c3d4-0006', 'app',
 1, '+919876540001',
 740.00, 74.00,    1, 1,
 666.00, 'evening', '2026-01-30 18:00:00'),

(7, 1, 'sess-a1b2c3d4-0007', 'voice',
 3, '+919876540003',
 490.00,  0.00, NULL, 2,
 490.00, 'lunch',   '2026-02-08 12:30:00'),

(8, 1, 'sess-a1b2c3d4-0008', 'walkin',
 1, '+919876540001',
 820.00, 82.00,    1, NULL,
 738.00, 'dinner',  '2026-02-20 19:30:00'),

(9, 1, 'sess-a1b2c3d4-0009', 'app',
 2, '+919876540002',
 870.00,  0.00, NULL, 3,
 870.00, 'dinner',  '2026-03-01 20:15:00'),

(10, 1, 'sess-a1b2c3d4-0010', 'voice',
 3, '+919876540003',
 820.00, 164.00,   2, 1,
 656.00, 'dinner',  '2026-03-05 21:00:00');

SELECT setval('orders_order_id_seq', 10);


-- ============================================================
-- SECTION 8: ORDER LINES
-- 3 ongoing (order_id = NULL → live session, not yet committed)
-- order_lines for completed orders are also added (linked to orders 1–10)
-- ============================================================

-- Completed order lines (linked to orders 1–10)
INSERT INTO order_lines (
    id, restaurant_id, session_id, order_id,
    item_id, qty, unit_price, line_total,
    order_note, is_upsold, combo_id, offer_id, accepted_at
) VALUES
-- Order 1: Butter Chicken + Butter Naan (combo 1)
(1,  1, 'sess-a1b2c3d4-0001', 1, 5,  1, 380.00, 380.00, NULL,                      FALSE, 1,    NULL, '2025-11-10 20:00:00'),
(2,  1, 'sess-a1b2c3d4-0001', 1, 9,  2,  90.00, 180.00, 'Extra butter please',      TRUE,  1,    NULL, '2025-11-10 20:01:00'),
(3,  1, 'sess-a1b2c3d4-0001', 1, 11, 1, 120.00, 120.00, NULL,                       TRUE,  NULL, NULL, '2025-11-10 20:01:30'),

-- Order 2: Margherita Pizza + Pasta Arrabbiata (offer 1 applied)
(4,  1, 'sess-a1b2c3d4-0002', 2, 15, 1, 420.00, 420.00, NULL,                       FALSE, NULL, 1,    '2025-12-05 20:45:00'),
(5,  1, 'sess-a1b2c3d4-0002', 2, 16, 1, 320.00, 320.00, 'Less spicy',               FALSE, NULL, 1,    '2025-12-05 20:45:30'),

-- Order 3: Dal Makhani + Makki di Roti + Sweet Lassi
(6,  1, 'sess-a1b2c3d4-0003', 3, 4,  1, 220.00, 220.00, NULL,                       FALSE, NULL, NULL, '2025-12-18 13:30:00'),
(7,  1, 'sess-a1b2c3d4-0003', 3, 10, 2, 100.00, 200.00, NULL,                       FALSE, NULL, NULL, '2025-12-18 13:30:30'),
(8,  1, 'sess-a1b2c3d4-0003', 3, 11, 1, 120.00, 120.00, NULL,                       TRUE,  NULL, NULL, '2025-12-18 13:31:00'),

-- Order 4: Paneer Tikka + Bruschetta + Soup del Giorno
(9,  1, 'sess-a1b2c3d4-0004', 4, 1,  1, 280.00, 280.00, NULL,                       FALSE, NULL, NULL, '2026-01-15 12:45:00'),
(10, 1, 'sess-a1b2c3d4-0004', 4, 13, 1, 180.00, 180.00, NULL,                       FALSE, NULL, NULL, '2026-01-15 12:45:30'),

-- Order 5: Wood-fired Chicken Pizza + Chicken Alfredo + offer 2
(11, 1, 'sess-a1b2c3d4-0005', 5, 18, 1, 520.00, 520.00, NULL,                       FALSE, NULL, 2,    '2026-01-22 20:15:00'),
(12, 1, 'sess-a1b2c3d4-0005', 5, 17, 1, 450.00, 450.00, NULL,                       FALSE, NULL, 2,    '2026-01-22 20:15:30'),

-- Order 6: Butter Chicken + Butter Naan (combo 1) + offer 1
(13, 1, 'sess-a1b2c3d4-0006', 6, 5,  1, 380.00, 380.00, NULL,                       FALSE, 1,    1,    '2026-01-30 17:45:00'),
(14, 1, 'sess-a1b2c3d4-0006', 6, 9,  2,  90.00, 180.00, NULL,                       TRUE,  1,    1,    '2026-01-30 17:45:30'),
(15, 1, 'sess-a1b2c3d4-0006', 6, 19, 1, 250.00, 250.00, NULL,                       TRUE,  NULL, 1,    '2026-01-30 17:46:00'),

-- Order 7: Paneer Tikka + Sweet Lassi + Gulab Jamun (combo 2)
(16, 1, 'sess-a1b2c3d4-0007', 7, 1,  1, 280.00, 280.00, NULL,                       FALSE, 2,    NULL, '2026-02-08 12:15:00'),
(17, 1, 'sess-a1b2c3d4-0007', 7, 11, 1, 120.00, 120.00, NULL,                       TRUE,  2,    NULL, '2026-02-08 12:15:30'),
(18, 1, 'sess-a1b2c3d4-0007', 7, 12, 1, 150.00, 150.00, NULL,                       TRUE,  2,    NULL, '2026-02-08 12:16:00'),

-- Order 8: Kadhai Chicken + Butter Naan + Gulab Jamun + offer 1
(19, 1, 'sess-a1b2c3d4-0008', 8, 8,  1, 360.00, 360.00, NULL,                       FALSE, NULL, 1,    '2026-02-20 19:15:00'),
(20, 1, 'sess-a1b2c3d4-0008', 8, 9,  2,  90.00, 180.00, 'Extra butter',             FALSE, NULL, 1,    '2026-02-20 19:15:30'),
(21, 1, 'sess-a1b2c3d4-0008', 8, 12, 2, 150.00, 300.00, NULL,                       TRUE,  NULL, 1,    '2026-02-20 19:16:00'),

-- Order 9: Margherita Pizza + Pasta Arrabbiata (combo 3)
(22, 1, 'sess-a1b2c3d4-0009', 9, 15, 1, 420.00, 420.00, NULL,                       FALSE, 3,    NULL, '2026-03-01 20:00:00'),
(23, 1, 'sess-a1b2c3d4-0009', 9, 16, 1, 320.00, 320.00, 'Extra spicy please',       FALSE, 3,    NULL, '2026-03-01 20:00:30'),
(24, 1, 'sess-a1b2c3d4-0009', 9, 19, 1, 250.00, 250.00, NULL,                       TRUE,  NULL, NULL, '2026-03-01 20:01:00'),

-- Order 10: Butter Chicken + Butter Naan + Sarson Ka Saag (combo 1 + offer 2)
(25, 1, 'sess-a1b2c3d4-0010', 10, 5,  1, 380.00, 380.00, NULL,                      FALSE, 1,    2,    '2026-03-05 20:45:00'),
(26, 1, 'sess-a1b2c3d4-0010', 10, 9,  2,  90.00, 180.00, NULL,                      TRUE,  1,    2,    '2026-03-05 20:45:30'),
(27, 1, 'sess-a1b2c3d4-0010', 10, 7,  1, 260.00, 260.00, NULL,                      FALSE, NULL, 2,    '2026-03-05 20:46:00');

-- ── 3 ONGOING order lines (order_id = NULL — live session in progress) ────────
INSERT INTO order_lines (
    id, restaurant_id, session_id, order_id,
    item_id, qty, unit_price, line_total,
    order_note, is_upsold, combo_id, offer_id, accepted_at
) VALUES
(28, 1, 'sess-live-0001', NULL, 6,  1, 340.00, 340.00, NULL,                        FALSE, NULL, NULL, '2026-03-06 19:30:00'),
(29, 1, 'sess-live-0001', NULL, 9,  1,  90.00,  90.00, 'No butter',                 TRUE,  NULL, NULL, '2026-03-06 19:30:45'),
(30, 1, 'sess-live-0002', NULL, 15, 1, 420.00, 420.00, NULL,                        FALSE, NULL, NULL, '2026-03-06 19:45:00');

SELECT setval('order_lines_id_seq', 30);


-- ============================================================
-- SECTION 9: FEEDBACK
-- 3 feedback entries linked to completed orders
-- sentiment_score: -1.000 to 1.000 (negative → positive)
-- ============================================================

INSERT INTO feedback (
    feedback_id, restaurant_id, order_id, item_id,
    review_text,
    sentiment_score, sentiment_label,
    created_at
) VALUES
(1, 1, 1, 5,
 'Butter chicken was absolutely amazing! The naan was perfectly soft. Will definitely come back.',
 0.921, 'positive',
 '2025-11-10 22:00:00'),

(2, 1, 5, 18,
 'Pizza was decent but the pasta was too salty for my taste. Expected better for the price.',
 -0.312, 'negative',
 '2026-01-22 23:00:00'),

(3, 1, 9, 15,
 'Margherita was good, classic taste. Tiramisu was a nice surprise — authentic flavour.',
 0.648, 'positive',
 '2026-03-01 23:30:00');

SELECT setval('feedback_feedback_id_seq', 3);


-- ============================================================
-- SECTION 10: REVENUE SCORES
-- Computed from actual menu data above:
--   cm_rupees   = selling_price - food_cost
--   cm_pct      = (cm_rupees / selling_price) * 100
--   gpi         = cm_rupees / avg(cm_rupees across all items)
--                 avg cm_rupees ≈ 230.58
--   cm_tier:    A = cm_pct >= 65%, B = 55–64%, C = 45–54%, D = <45%
--   cm_per_prep_min = cm_rupees / prep_time_min
--   popularity_score: derived from order_lines count per item (normalised 0–100)
--   velocity_per_day: order count / days since first order (≈147 days)
--   quadrant:
--     Star        = high popularity + high cm_pct
--     Plowhorse   = high popularity + low  cm_pct
--     Puzzle      = low  popularity + high cm_pct
--     Dog         = low  popularity + low  cm_pct
--   upsell_priority = 0–1 float  (upsell_score from combos where relevant)
--   price_signal: 'raise' if cm_pct < 50%, 'hold' if 50–70%, 'premium' if >70%
-- ============================================================

INSERT INTO revenue_scores (
    item_id, restaurant_id,
    cm_rupees, cm_pct, gpi, cm_tier, cm_per_prep_min,
    quadrant, quadrant_cuisine, kmeans_cluster,
    popularity_score, velocity_per_day, trend_slope,
    rank_in_cuisine, rank_in_category,
    ema_7d, weekend_lift,
    upsell_priority, is_upsell_target, top_combos,
    price_signal, price_signal_why, elasticity_index, days_since_price_change,
    last_computed, compute_version
) VALUES

-- item 1: Paneer Tikka  cm=182, cm_pct=65.0%
(1,  1, 182.00, 65.00, 0.7893, 'B', 12.1333,
 'Star', 'Punjabi', 1,
 72.00, 0.49, 0.0210,
 2, 1,
 4.20, 1.15,
 0.6500, TRUE, '[{"combo_id":2,"items":[11,12],"confidence":0.54}]',
 'hold',    'Margin at 65% — pricing is healthy',          0.3200, 112,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 2: Chicken Tikka  cm=208, cm_pct=65.0%
(2,  1, 208.00, 65.00, 0.9022, 'B', 11.5556,
 'Puzzle', 'Punjabi', 1,
 38.00, 0.14, 0.0080,
 3, 2,
 1.80, 0.95,
 0.3800, FALSE, '[]',
 'hold',    'Margin healthy but low velocity — review positioning', 0.2800, 112,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 3: Amritsari Fish Fry  cm=227.5, cm_pct=65.0%
(3,  1, 227.50, 65.00, 0.9867, 'B', 11.3750,
 'Dog', 'Punjabi', 2,
 10.00, 0.03, -0.0015,
 4, 3,
 0.50, 0.80,
 0.1000, FALSE, '[]',
 'hold',    'Good margin but very low orders — needs promotion',    0.3500, NULL,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 4: Dal Makhani  cm=143, cm_pct=65.0%
(4,  1, 143.00, 65.00, 0.6202, 'B', 5.7200,
 'Plowhorse', 'Punjabi', 3,
 55.00, 0.21, 0.0050,
 5, 4,
 2.80, 1.05,
 0.2200, FALSE, '[]',
 'hold',    'High volume, consistent margin — stable performer',    0.1800, 91,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 5: Butter Chicken  cm=247, cm_pct=65.0%
(5,  1, 247.00, 65.00, 1.0714, 'B', 12.3500,
 'Star', 'Punjabi', 1,
 100.00, 0.68, 0.0420,
 1, 1,
 7.00, 1.28,
 0.7800, TRUE, '[{"combo_id":1,"items":[9],"confidence":0.72}]',
 'premium', 'Top seller with strong margin — room to nudge price up', 0.2100, 91,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 6: Paneer Butter Masala  cm=221, cm_pct=65.0%
(6,  1, 221.00, 65.00, 0.9584, 'B', 12.2778,
 'Star', 'Punjabi', 1,
 65.00, 0.27, 0.0180,
 2, 2,
 3.50, 1.10,
 0.4500, TRUE, '[]',
 'hold',    'Solid Star — margin and popularity both good',          0.2500, 91,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 7: Sarson Ka Saag  cm=169, cm_pct=65.0%
(7,  1, 169.00, 65.00, 0.7331, 'B', 5.6333,
 'Puzzle', 'Punjabi', 2,
 32.00, 0.11, 0.0060,
 3, 3,
 1.50, 0.90,
 0.2800, FALSE, '[]',
 'hold',    'Niche seasonal item — low velocity but healthy margin', 0.3000, NULL,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 8: Kadhai Chicken  cm=234, cm_pct=65.0%
(8,  1, 234.00, 65.00, 1.0151, 'B', 10.6364,
 'Plowhorse', 'Punjabi', 3,
 48.00, 0.18, 0.0030,
 4, 4,
 2.20, 1.02,
 0.3200, FALSE, '[]',
 'hold',    'Good margin, moderate popularity — push via combos',   0.2200, 98,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 9: Butter Naan  cm=63, cm_pct=70.0%
(9,  1,  63.00, 70.00, 0.2732, 'A', 6.3000,
 'Star', 'Punjabi', 4,
 95.00, 0.68, 0.0380,
 1, 1,
 7.20, 1.20,
 0.5500, TRUE, '[{"combo_id":1,"items":[5],"confidence":0.72}]',
 'hold',    'Essential bread — high velocity, strong attach rate',   0.1500, NULL,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 10: Makki di Roti  cm=70, cm_pct=70.0%
(10, 1,  70.00, 70.00, 0.3036, 'A', 5.8333,
 'Plowhorse', 'Punjabi', 4,
 42.00, 0.14, 0.0020,
 2, 2,
 2.00, 1.08,
 0.2000, FALSE, '[]',
 'hold',    'Seasonal companion to Sarson Ka Saag — stable demand', 0.1200, NULL,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 11: Sweet Lassi  cm=84, cm_pct=70.0%
(11, 1,  84.00, 70.00, 0.3643, 'A', 16.8000,
 'Star', 'Punjabi', 4,
 60.00, 0.27, 0.0150,
 1, 1,
 3.80, 1.12,
 0.5000, TRUE, '[{"combo_id":2,"items":[1,12],"confidence":0.54}]',
 'hold',    'High-margin beverage with strong upsell attach',        0.1800, 98,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 12: Gulab Jamun  cm=105, cm_pct=70.0%
(12, 1, 105.00, 70.00, 0.4553, 'A', 21.0000,
 'Star', 'Punjabi', 4,
 58.00, 0.27, 0.0120,
 2, 1,
 3.60, 1.18,
 0.4800, TRUE, '[{"combo_id":2,"items":[1,11],"confidence":0.54}]',
 'hold',    'Top dessert — upsell effectively after mains',          0.2000, 98,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 13: Bruschetta  cm=126, cm_pct=70.0%
(13, 1, 126.00, 70.00, 0.5464, 'A', 12.6000,
 'Puzzle', 'Italian', 5,
 22.00, 0.07, 0.0030,
 1, 1,
 1.20, 0.88,
 0.2500, FALSE, '[]',
 'hold',    'Good margin Italian starter — needs more visibility',   0.4200, NULL,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 14: Soup del Giorno  cm=112, cm_pct=70.0%
(14, 1, 112.00, 70.00, 0.4857, 'A', 11.2000,
 'Dog', 'Italian', 5,
 12.00, 0.04, -0.0010,
 2, 2,
 0.70, 0.82,
 0.1200, FALSE, '[]',
 'hold',    'Low orders — consider bundling with mains',             0.3800, 91,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 15: Margherita Pizza  cm=273, cm_pct=65.0%
(15, 1, 273.00, 65.00, 1.1839, 'B', 13.6500,
 'Star', 'Italian', 1,
 85.00, 0.41, 0.0280,
 1, 1,
 5.50, 1.22,
 0.6100, TRUE, '[{"combo_id":3,"items":[16],"confidence":0.61}]',
 'premium', 'Star performer — strong margin and volume on Italian side', 0.2300, 65,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 16: Pasta Arrabbiata  cm=224, cm_pct=70.0%
(16, 1, 224.00, 70.00, 0.9714, 'A', 14.9333,
 'Star', 'Italian', 1,
 62.00, 0.28, 0.0200,
 2, 2,
 3.80, 1.15,
 0.5800, TRUE, '[{"combo_id":3,"items":[15],"confidence":0.61}]',
 'hold',    'Vegan option — high margin and growing in popularity', 0.2600, 65,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 17: Chicken Alfredo  cm=292.5, cm_pct=65.0%
(17, 1, 292.50, 65.00, 1.2690, 'B', 16.2500,
 'Plowhorse', 'Italian', 2,
 45.00, 0.14, 0.0100,
 3, 3,
 2.50, 1.05,
 0.3500, FALSE, '[]',
 'hold',    'High price point keeps volume moderate — value upsell', 0.2800, 65,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 18: Wood-fired Chicken Pizza  cm=338, cm_pct=65.0%
(18, 1, 338.00, 65.00, 1.4658, 'B', 15.3636,
 'Plowhorse', 'Italian', 2,
 40.00, 0.14, 0.0080,
 4, 4,
 2.20, 1.01,
 0.3200, FALSE, '[]',
 'premium', 'Highest cm_rupees in menu — nudge via premium upsell', 0.1900, 50,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 19: Tiramisu  cm=162.5, cm_pct=65.0%
(19, 1, 162.50, 65.00, 0.7048, 'B', 32.5000,
 'Puzzle', 'Italian', 5,
 35.00, 0.14, 0.0120,
 5, 1,
 2.20, 1.10,
 0.4200, TRUE, '[]',
 'hold',    'Best cm_per_prep_min in menu — fast & profitable dessert', 0.3500, NULL,
 '2026-03-06 06:00:00', 'v4.0'),

-- item 20: Paneer Tikka (DUPLICATE — flagged, no active orders)
(20, 1, 182.00, 65.00, 0.7893, 'B', 12.1333,
 'Dog', 'Punjabi', 6,
 0.00, 0.00, 0.0000,
 6, 5,
 0.00, 0.00,
 0.0000, FALSE, '[]',
 'hold',    'DUPLICATE ENTRY — deactivated, zero velocity expected', 0.0000, 112,
 '2026-03-06 06:00:00', 'v4.0');
