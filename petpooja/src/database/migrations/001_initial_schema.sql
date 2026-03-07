-- ============================================================
--  001_initial_schema.sql
--  AI Voice Ordering Copilot — Complete Database Schema
--  Run: psql -U postgres -d voice_ordering -f this_file.sql
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- Trigram index for fuzzy search

-- ── Restaurant ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurants (
  id            TEXT        PRIMARY KEY DEFAULT 'rest_' || substr(uuid_generate_v4()::text, 1, 8),
  name          TEXT        NOT NULL,
  phone         TEXT,
  address       TEXT,
  timezone      TEXT        NOT NULL DEFAULT 'Asia/Kolkata',
  tax_rate      NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  pos_provider  TEXT        NOT NULL DEFAULT 'generic',
  pos_config    JSONB       NOT NULL DEFAULT '{}',
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Menu categories ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_categories (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  name_hi         TEXT,
  sort_order      INT         NOT NULL DEFAULT 0,
  is_available    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant
  ON menu_categories(restaurant_id);

-- ── Menu items ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id     UUID        NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  category        TEXT        NOT NULL,          -- Denormalised for fast reads
  name            TEXT        NOT NULL,
  name_hi         TEXT,                          -- Hindi name
  name_hinglish   TEXT,                          -- Romanised Hindi
  aliases         TEXT[]      DEFAULT '{}',      -- Other names customers say
  description     TEXT,
  price           NUMERIC(10,2) NOT NULL,
  is_available    BOOLEAN     NOT NULL DEFAULT TRUE,
  is_vegetarian   BOOLEAN     NOT NULL DEFAULT FALSE,
  modifier_groups JSONB       DEFAULT '[]',      -- Embedded modifier groups
  tags            TEXT[]      DEFAULT '{}',
  image_url       TEXT,
  pos_item_id     TEXT        NOT NULL,          -- ID in the POS system
  search_vector   TSVECTOR,                      -- Full-text search
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant
  ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category
  ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available
  ON menu_items(restaurant_id, is_available);
CREATE INDEX IF NOT EXISTS idx_menu_items_fts
  ON menu_items USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_menu_items_name_trgm
  ON menu_items USING GIN(name gin_trgm_ops);

-- Auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION update_menu_item_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.name_hi, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.name_hinglish, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(COALESCE(NEW.aliases, '{}'), ' ')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_menu_items_search_vector ON menu_items;
CREATE TRIGGER trg_menu_items_search_vector
  BEFORE INSERT OR UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION update_menu_item_search_vector();

-- ── Call sessions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_sessions (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_sid             TEXT        NOT NULL UNIQUE,   -- Twilio CallSid
  phone_number         TEXT        NOT NULL,
  restaurant_id        TEXT        NOT NULL REFERENCES restaurants(id),
  state                TEXT        NOT NULL DEFAULT 'IDLE',
  language             TEXT        NOT NULL DEFAULT 'en',
  conversation_history JSONB       NOT NULL DEFAULT '[]',
  partial_order        JSONB,
  upsell_offered       BOOLEAN     NOT NULL DEFAULT FALSE,
  upsell_accepted      BOOLEAN     NOT NULL DEFAULT FALSE,
  retry_count          INT         NOT NULL DEFAULT 0,
  call_duration_s      INT,
  ended_at             TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_call_sid
  ON call_sessions(call_sid);
CREATE INDEX IF NOT EXISTS idx_call_sessions_restaurant
  ON call_sessions(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_sessions_phone
  ON call_sessions(phone_number, created_at DESC);

-- ── Orders ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id           UUID        REFERENCES call_sessions(id),
  restaurant_id        TEXT        NOT NULL REFERENCES restaurants(id),
  items                JSONB       NOT NULL DEFAULT '[]',
  status               TEXT        NOT NULL DEFAULT 'collecting',
  subtotal             NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  language             TEXT        NOT NULL DEFAULT 'en',
  customer_phone       TEXT,
  special_instructions TEXT,
  pos_order_id         TEXT,
  kot_number           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant
  ON orders(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_session
  ON orders(session_id);

-- ── Upsell rules ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upsell_rules (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id        TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  trigger_category     TEXT,
  trigger_item_ids     TEXT[]      DEFAULT '{}',
  recommended_item_ids TEXT[]      NOT NULL DEFAULT '{}',
  reason               TEXT        NOT NULL,
  priority             INT         NOT NULL DEFAULT 1,
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upsell_rules_restaurant
  ON upsell_rules(restaurant_id, is_active);

-- ── Upsell recommendations log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upsell_recommendations (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id       UUID        REFERENCES orders(id),
  session_id     UUID        REFERENCES call_sessions(id),
  rule_id        UUID        REFERENCES upsell_rules(id),
  suggested_items TEXT[]     NOT NULL DEFAULT '{}',
  was_accepted   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── updated_at auto-trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'restaurants', 'menu_categories', 'menu_items',
    'call_sessions', 'orders'
  ] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
      CREATE TRIGGER trg_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    ', t, t, t, t);
  END LOOP;
END;
$$;

-- ── Sample restaurant seed ────────────────────────────────────────────────────
INSERT INTO restaurants (id, name, phone, tax_rate, pos_provider)
VALUES ('rest_001', 'Spice Garden Restaurant', '+919876543210', 5.00, 'generic')
ON CONFLICT (id) DO NOTHING;

-- Sample menu category
INSERT INTO menu_categories (id, restaurant_id, name, name_hi, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'rest_001', 'Starters', 'स्टार्टर', 1),
  ('00000000-0000-0000-0000-000000000002', 'rest_001', 'Main Course', 'मुख्य व्यंजन', 2),
  ('00000000-0000-0000-0000-000000000003', 'rest_001', 'Breads', 'रोटी', 3),
  ('00000000-0000-0000-0000-000000000004', 'rest_001', 'Beverages', 'पेय', 4),
  ('00000000-0000-0000-0000-000000000005', 'rest_001', 'Desserts', 'मिठाई', 5)
ON CONFLICT (id) DO NOTHING;

-- Sample menu items
INSERT INTO menu_items (
  id, restaurant_id, category_id, category, name, name_hi, name_hinglish,
  aliases, price, is_vegetarian, pos_item_id,
  modifier_groups, tags
) VALUES
  (
    'a0000000-0000-0000-0000-000000000001', 'rest_001',
    '00000000-0000-0000-0000-000000000001', 'Starters',
    'Paneer Tikka', 'पनीर टिक्का', 'paneer tikka',
    ARRAY['paneer tikka', 'पनीर टिक्का', 'panner tikka'], 280.00, TRUE, 'POS_PT_001',
    '[{"id":"mg1","name":"Spice Level","type":"single","required":false,"options":[{"id":"mo1","name":"Mild","price_delta":0},{"id":"mo2","name":"Medium","price_delta":0},{"id":"mo3","name":"Spicy","price_delta":0}]}]',
    ARRAY['vegetarian', 'bestseller', 'starter']
  ),
  (
    'a0000000-0000-0000-0000-000000000002', 'rest_001',
    '00000000-0000-0000-0000-000000000001', 'Starters',
    'Chicken Tikka', 'चिकन टिक्का', 'chicken tikka',
    ARRAY['chicken tikka', 'चिकन टिक्का'], 320.00, FALSE, 'POS_CT_001',
    '[{"id":"mg1","name":"Spice Level","type":"single","required":false,"options":[{"id":"mo1","name":"Mild","price_delta":0},{"id":"mo2","name":"Medium","price_delta":0},{"id":"mo3","name":"Spicy","price_delta":0}]}]',
    ARRAY['non-veg', 'bestseller', 'starter']
  ),
  (
    'a0000000-0000-0000-0000-000000000003', 'rest_001',
    '00000000-0000-0000-0000-000000000002', 'Main Course',
    'Butter Chicken', 'बटर चिकन', 'butter chicken',
    ARRAY['butter chicken', 'बटर चिकन', 'makhani chicken', 'murgh makhani'], 380.00, FALSE, 'POS_BC_001',
    '[]', ARRAY['non-veg', 'bestseller', 'gravy']
  ),
  (
    'a0000000-0000-0000-0000-000000000004', 'rest_001',
    '00000000-0000-0000-0000-000000000002', 'Main Course',
    'Paneer Butter Masala', 'पनीर बटर मसाला', 'paneer butter masala',
    ARRAY['paneer butter masala', 'पनीर मखनी', 'paneer makhani', 'pbm'], 320.00, TRUE, 'POS_PBM_001',
    '[]', ARRAY['vegetarian', 'bestseller', 'gravy']
  ),
  (
    'a0000000-0000-0000-0000-000000000005', 'rest_001',
    '00000000-0000-0000-0000-000000000003', 'Breads',
    'Butter Naan', 'बटर नान', 'butter naan',
    ARRAY['butter naan', 'बटर नान', 'naan', 'naan bread'], 60.00, TRUE, 'POS_BN_001',
    '[]', ARRAY['vegetarian', 'bread']
  ),
  (
    'a0000000-0000-0000-0000-000000000006', 'rest_001',
    '00000000-0000-0000-0000-000000000003', 'Breads',
    'Garlic Naan', 'लहसुन नान', 'garlic naan',
    ARRAY['garlic naan', 'लहसुन नान', 'garlic bread'], 70.00, TRUE, 'POS_GN_001',
    '[]', ARRAY['vegetarian', 'bread']
  ),
  (
    'a0000000-0000-0000-0000-000000000007', 'rest_001',
    '00000000-0000-0000-0000-000000000004', 'Beverages',
    'Sweet Lassi', 'मीठी लस्सी', 'sweet lassi',
    ARRAY['lassi', 'sweet lassi', 'मीठी लस्सी', 'meethi lassi'], 80.00, TRUE, 'POS_SL_001',
    '[]', ARRAY['vegetarian', 'beverage', 'cold']
  ),
  (
    'a0000000-0000-0000-0000-000000000008', 'rest_001',
    '00000000-0000-0000-0000-000000000005', 'Desserts',
    'Gulab Jamun', 'गुलाब जामुन', 'gulab jamun',
    ARRAY['gulab jamun', 'गुलाब जामुन', 'gulab jaamun'], 120.00, TRUE, 'POS_GJ_001',
    '[{"id":"mg2","name":"Serving","type":"single","required":false,"options":[{"id":"mo4","name":"2 pieces","price_delta":0},{"id":"mo5","name":"4 pieces","price_delta":60}]}]',
    ARRAY['vegetarian', 'dessert', 'sweet']
  )
ON CONFLICT (id) DO NOTHING;

-- Sample upsell rules
INSERT INTO upsell_rules (restaurant_id, trigger_category, recommended_item_ids, reason, priority)
VALUES
  ('rest_001', 'Main Course', ARRAY['a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006'], 'Suggest bread with main course', 10),
  ('rest_001', 'Starters',    ARRAY['a0000000-0000-0000-0000-000000000007'], 'Suggest lassi with starters', 8),
  ('rest_001', 'Breads',      ARRAY['a0000000-0000-0000-0000-000000000007'], 'Suggest lassi with breads', 7)
ON CONFLICT DO NOTHING;
