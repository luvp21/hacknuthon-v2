-- ============================================================
--  002_revenue_engine.sql
--  Revenue Intelligence Engine — Schema
-- ============================================================

-- ── Add food_cost to menu_items ───────────────────────────────────────────────
-- If NULL, the engine assumes 40% of selling_price as default.
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS food_cost NUMERIC(10,2) DEFAULT NULL;

-- ── Revenue Scores ────────────────────────────────────────────────────────────
-- Pre-computed by the Revenue Engine. Brain reads this during live calls.
CREATE TABLE IF NOT EXISTS revenue_scores (
  item_id          UUID          PRIMARY KEY REFERENCES menu_items(id) ON DELETE CASCADE,
  restaurant_id    TEXT          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  margin_score     NUMERIC(10,2) NOT NULL DEFAULT 0,   -- selling_price - food_cost
  margin_pct       NUMERIC(6,2)  NOT NULL DEFAULT 0,   -- margin as % of selling price
  popularity_score NUMERIC(6,2)  NOT NULL DEFAULT 0,   -- normalised 0-100 (last 30 days)
  quadrant         TEXT          NOT NULL DEFAULT 'Dog',-- Star | Hidden Star | Risk | Dog
  upsell_priority  NUMERIC(6,4)  NOT NULL DEFAULT 0,   -- 0-1 float, higher = show first
  top_combos       JSONB         NOT NULL DEFAULT '[]', -- [{item_id, name, confidence}]
  last_computed    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_scores_restaurant
  ON revenue_scores(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_revenue_scores_priority
  ON revenue_scores(restaurant_id, upsell_priority DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_scores_quadrant
  ON revenue_scores(restaurant_id, quadrant);

-- ── Combos ────────────────────────────────────────────────────────────────────
-- Co-occurrence data from historical orders (Apriori-style).
CREATE TABLE IF NOT EXISTS combos (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id        TEXT          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  item_a               UUID          NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  item_b               UUID          NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  co_occurrence_count  INT           NOT NULL DEFAULT 0,
  confidence           NUMERIC(6,4)  NOT NULL DEFAULT 0, -- P(B|A)
  lift                 NUMERIC(8,4)  NOT NULL DEFAULT 0, -- confidence / P(B)
  last_updated         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(restaurant_id, item_a, item_b)
);

CREATE INDEX IF NOT EXISTS idx_combos_item_a       ON combos(item_a);
CREATE INDEX IF NOT EXISTS idx_combos_restaurant   ON combos(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_combos_confidence   ON combos(item_a, confidence DESC);

-- ── Seed food_cost for sample items (40% default margin) ─────────────────────
UPDATE menu_items SET food_cost = ROUND(price * 0.40, 2) WHERE food_cost IS NULL;

-- ── Extend call_sessions: upsell_shown + customer_name ───────────────────────
-- upsell_shown: JSONB array of item UUIDs shown to this caller (prevents repeats)
-- customer_name: extracted from conversation by the Brain
ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS upsell_shown  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS customer_name TEXT  DEFAULT NULL;
