-- ============================================================
-- RESET & MIGRATE — Drops all existing tables, then applies
-- the new schema from schema.sql (V4, PostgreSQL-compatible)
-- Run: psql $DATABASE_URL -f reset_and_migrate.sql
-- ============================================================

-- Drop old tables from previous UUID-based schema
DROP TABLE IF EXISTS revenue_scores     CASCADE;
DROP TABLE IF EXISTS combos             CASCADE;
DROP TABLE IF EXISTS feedback           CASCADE;
DROP TABLE IF EXISTS order_lines        CASCADE;
DROP TABLE IF EXISTS orders             CASCADE;
DROP TABLE IF EXISTS active_offers      CASCADE;
DROP TABLE IF EXISTS customers          CASCADE;
DROP TABLE IF EXISTS inventory          CASCADE;
DROP TABLE IF EXISTS menu_items         CASCADE;
DROP TABLE IF EXISTS menu_categories    CASCADE;
DROP TABLE IF EXISTS call_sessions      CASCADE;
DROP TABLE IF EXISTS restaurants        CASCADE;

-- Drop old functions/triggers if they exist
DROP FUNCTION IF EXISTS update_menu_item_search_vector() CASCADE;

-- Drop old extensions (optional — harmless to leave)
-- DROP EXTENSION IF EXISTS "uuid-ossp";
-- DROP EXTENSION IF EXISTS "pg_trgm";

-- ============================================================
-- NOW APPLY THE NEW SCHEMA (V4)
-- ============================================================

-- ============================================================
-- 1. RESTAURANTS
-- ============================================================

CREATE TABLE restaurants (
    restaurant_id       SERIAL          PRIMARY KEY,
    name                VARCHAR(100)    NOT NULL,
    cuisine_type        VARCHAR(50),
    opening_time        TIME            DEFAULT '08:00:00',
    closing_time        TIME            DEFAULT '23:00:00',
    created_at          TIMESTAMP       DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 2. MENU ITEMS
-- ============================================================

CREATE TABLE menu_items (
    item_id                 SERIAL          PRIMARY KEY,
    restaurant_id           INT             NOT NULL REFERENCES restaurants(restaurant_id),
    name                    VARCHAR(120)    NOT NULL,
    cuisine                 VARCHAR(60)     NOT NULL,
    description             TEXT,
    selling_price           DECIMAL(10,2)   NOT NULL,
    prev_price              DECIMAL(10,2),
    last_price_updated      DATE,
    food_cost               DECIMAL(10,2)   NOT NULL,
    is_veg                  BOOLEAN         DEFAULT TRUE,
    is_vegan                BOOLEAN         DEFAULT FALSE,
    is_available            BOOLEAN         DEFAULT TRUE,
    prep_time_min           SMALLINT,
    created_at              TIMESTAMP       DEFAULT NOW()
);

CREATE INDEX idx_menu_restaurant ON menu_items(restaurant_id);
CREATE INDEX idx_menu_available  ON menu_items(restaurant_id, is_available);


-- ============================================================
-- 3. INVENTORY
-- ============================================================

CREATE TABLE inventory (
    inventory_id        SERIAL          PRIMARY KEY,
    restaurant_id       INT             NOT NULL REFERENCES restaurants(restaurant_id),
    item_id             INT             NOT NULL REFERENCES menu_items(item_id),
    max_servings        INT             NOT NULL,
    current_remaining   INT             NOT NULL,
    last_reset_at       TIMESTAMP       NOT NULL,
    UNIQUE (restaurant_id, item_id)
);


-- ============================================================
-- 4. CUSTOMERS
-- ============================================================

CREATE TABLE customers (
    customer_id             SERIAL          PRIMARY KEY,
    restaurant_id           INT             NOT NULL REFERENCES restaurants(restaurant_id),
    phone                   VARCHAR(15)     NOT NULL,
    name                    VARCHAR(80),
    first_visit_at          TIMESTAMP       NOT NULL,
    last_visit_at           TIMESTAMP       NOT NULL,
    visit_count             INT             NOT NULL DEFAULT 1,
    total_spent             DECIMAL(12,2)   NOT NULL DEFAULT 0,
    avg_order_value         DECIMAL(10,2),
    turnaround_days         DECIMAL(6,1),
    customer_segment        VARCHAR(20)     NOT NULL DEFAULT 'NEW',
    preferred_cuisine       VARCHAR(60),
    preferred_category      VARCHAR(60),
    UNIQUE (restaurant_id, phone)
);

CREATE INDEX idx_customers_segment    ON customers(restaurant_id, customer_segment);
CREATE INDEX idx_customers_last_visit ON customers(restaurant_id, last_visit_at);


-- ============================================================
-- 5. ACTIVE OFFERS
-- ============================================================

CREATE TABLE active_offers (
    offer_id            SERIAL          PRIMARY KEY,
    restaurant_id       INT             NOT NULL REFERENCES restaurants(restaurant_id),
    offer_type          VARCHAR(30)     NOT NULL DEFAULT 'cart_threshold',
    min_cart_value      DECIMAL(10,2)   NOT NULL,
    discount_type       VARCHAR(10)     NOT NULL,
    discount_value      DECIMAL(8,2)    NOT NULL,
    nudge_text          VARCHAR(255)    NOT NULL,
    display_text        VARCHAR(255),
    percentile_source   VARCHAR(10),
    is_active           BOOLEAN         DEFAULT TRUE,
    valid_from          TIMESTAMP,
    valid_to            TIMESTAMP,
    channel             VARCHAR(20)     DEFAULT 'all',
    max_uses_per_day    INT,
    uses_today          INT             DEFAULT 0
);

CREATE INDEX idx_offers_active ON active_offers(restaurant_id, is_active);


-- ============================================================
-- 6. COMBOS
-- ============================================================

CREATE TABLE combos (
    combo_id            SERIAL          PRIMARY KEY,
    restaurant_id       INT             NOT NULL REFERENCES restaurants(restaurant_id),
    item_a              INT             NOT NULL REFERENCES menu_items(item_id),
    item_b              INT             NOT NULL REFERENCES menu_items(item_id),
    item_c              INT             REFERENCES menu_items(item_id),
    combo_type          VARCHAR(20)     NOT NULL,
    combo_size          SMALLINT        NOT NULL,
    support             DECIMAL(7,5),
    confidence          DECIMAL(7,5),
    lift                DECIMAL(7,4),
    conviction          DECIMAL(7,4),
    margin_lift         DECIMAL(10,2),
    upsell_score        DECIMAL(6,4),
    synergy_score       DECIMAL(6,4),
    combo_cm_rupees     DECIMAL(10,2),
    max_discount_pct    DECIMAL(5,2),
    popularity_rank     SMALLINT,
    co_count            INT,
    last_updated        TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_combo_a      ON combos(restaurant_id, item_a);
CREATE INDEX idx_combo_b      ON combos(restaurant_id, item_b);
CREATE INDEX idx_combo_c      ON combos(restaurant_id, item_c);
CREATE INDEX idx_combo_upsell ON combos(restaurant_id, upsell_score DESC);


-- ============================================================
-- 7. ORDER LINES
-- ============================================================

CREATE TABLE order_lines (
    id              SERIAL          PRIMARY KEY,
    restaurant_id   INT             NOT NULL REFERENCES restaurants(restaurant_id),
    session_id      VARCHAR(36)     NOT NULL,
    order_id        INT,
    item_id         INT             NOT NULL REFERENCES menu_items(item_id),
    qty             SMALLINT        NOT NULL DEFAULT 1,
    unit_price      DECIMAL(10,2)   NOT NULL,
    line_total      DECIMAL(10,2)   NOT NULL,
    order_note      VARCHAR(500),
    is_upsold       BOOLEAN         DEFAULT FALSE,
    combo_id        INT             REFERENCES combos(combo_id),
    offer_id        INT             REFERENCES active_offers(offer_id),
    accepted_at     TIMESTAMP       NOT NULL
);

CREATE INDEX idx_ol_session    ON order_lines(session_id);
CREATE INDEX idx_ol_item       ON order_lines(item_id);
CREATE INDEX idx_ol_restaurant ON order_lines(restaurant_id, accepted_at);


-- ============================================================
-- 8. ORDERS
-- ============================================================

CREATE TABLE orders (
    order_id            SERIAL          PRIMARY KEY,
    restaurant_id       INT             NOT NULL REFERENCES restaurants(restaurant_id),
    session_id          VARCHAR(36)     NOT NULL,
    channel             VARCHAR(20)     NOT NULL,
    customer_id         INT             REFERENCES customers(customer_id),
    customer_phone      VARCHAR(15),
    order_total         DECIMAL(10,2)   NOT NULL,
    discount_applied    DECIMAL(10,2)   DEFAULT 0,
    offer_id            INT             REFERENCES active_offers(offer_id),
    combo_id            INT             REFERENCES combos(combo_id),
    net_total           DECIMAL(10,2)   NOT NULL,
    day_part            VARCHAR(20),
    completed_at        TIMESTAMP       NOT NULL
);

CREATE INDEX idx_orders_completed ON orders(restaurant_id, completed_at);
CREATE INDEX idx_orders_channel   ON orders(restaurant_id, channel);
CREATE INDEX idx_orders_net_total ON orders(restaurant_id, net_total);
CREATE INDEX idx_orders_customer  ON orders(customer_id);


-- ============================================================
-- 9. FEEDBACK
-- ============================================================

CREATE TABLE feedback (
    feedback_id         SERIAL          PRIMARY KEY,
    restaurant_id       INT             NOT NULL REFERENCES restaurants(restaurant_id),
    order_id            INT             NOT NULL REFERENCES orders(order_id),
    item_id             INT             REFERENCES menu_items(item_id),
    review_text         TEXT            NOT NULL,
    sentiment_score     DECIMAL(4,3),
    sentiment_label     VARCHAR(10),
    created_at          TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_item       ON feedback(item_id);
CREATE INDEX idx_feedback_order      ON feedback(order_id);
CREATE INDEX idx_feedback_restaurant ON feedback(restaurant_id, created_at);


-- ============================================================
-- 10. REVENUE SCORES
-- ============================================================

CREATE TABLE revenue_scores (
    item_id                     INT             NOT NULL REFERENCES menu_items(item_id),
    restaurant_id               INT             NOT NULL REFERENCES restaurants(restaurant_id),
    PRIMARY KEY (item_id, restaurant_id),

    -- M01 Contribution Margin
    cm_rupees                   DECIMAL(10,2),
    cm_pct                      DECIMAL(5,2),
    gpi                         DECIMAL(6,4),
    cm_tier                     CHAR(1),
    cm_per_prep_min             DECIMAL(8,4),

    -- M02 Menu Engineering Matrix
    quadrant                    VARCHAR(20),
    quadrant_cuisine            VARCHAR(20),
    kmeans_cluster              SMALLINT,

    -- M03 Popularity
    popularity_score            DECIMAL(5,2),
    velocity_per_day            DECIMAL(6,2),
    trend_slope                 DECIMAL(8,4),
    rank_in_cuisine             SMALLINT,
    rank_in_category            SMALLINT,
    ema_7d                      DECIMAL(8,2),
    weekend_lift                DECIMAL(5,2),

    -- M06 Upsell
    upsell_priority             DECIMAL(5,4),
    is_upsell_target            BOOLEAN,
    top_combos                  JSON,

    -- M07 Price Signal
    price_signal                VARCHAR(30),
    price_signal_why            TEXT,
    elasticity_index            DECIMAL(6,4),
    days_since_price_change     INT,

    -- Meta
    last_computed               TIMESTAMP,
    compute_version             VARCHAR(10)
);

CREATE INDEX idx_rs_restaurant ON revenue_scores(restaurant_id, quadrant);
CREATE INDEX idx_rs_upsell     ON revenue_scores(restaurant_id, upsell_priority DESC);


-- ============================================================
-- DEFERRED FK — order_lines.order_id → orders
-- ============================================================

ALTER TABLE order_lines
    ADD CONSTRAINT fk_ol_order_id
    FOREIGN KEY (order_id) REFERENCES orders(order_id);
