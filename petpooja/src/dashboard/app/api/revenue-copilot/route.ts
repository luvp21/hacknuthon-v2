import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Full item data (from 003_seed_data.sql)
// ─────────────────────────────────────────────────────────────────────────────

interface Item {
  name: string;
  cuisine: string;
  category: string;
  selling_price: number;
  food_cost: number;
  margin: number;        // selling_price - food_cost
  margin_pct: number;    // margin / selling_price * 100
  popularity: number;    // 0-100
  revenue: number;       // total tracked revenue
  prep_time: number;     // minutes
  prep_eff: number;      // margin per prep minute
  elasticity: number;
  trend_score: number;
  is_veg: boolean;
  quadrant: string;
}

const items: Item[] = [
  { name: "Paneer Tikka",           cuisine: "Punjabi", category: "Starter",  selling_price: 280, food_cost: 98,    margin: 182,   margin_pct: 65,  popularity: 72,  revenue: 560,  prep_time: 15, prep_eff: 12.13, elasticity: 0.32, trend_score: 0,  is_veg: true,  quadrant: "Star" },
  { name: "Chicken Tikka",          cuisine: "Punjabi", category: "Starter",  selling_price: 320, food_cost: 112,   margin: 208,   margin_pct: 65,  popularity: 38,  revenue: 0,    prep_time: 18, prep_eff: 11.56, elasticity: 0.28, trend_score: 0,  is_veg: false, quadrant: "Hidden Star" },
  { name: "Amritsari Fish Fry",     cuisine: "Punjabi", category: "Starter",  selling_price: 350, food_cost: 122.5, margin: 227.5, margin_pct: 65,  popularity: 10,  revenue: 0,    prep_time: 20, prep_eff: 11.38, elasticity: 0.35, trend_score: 0,  is_veg: false, quadrant: "Hidden Star" },
  { name: "Dal Makhani",            cuisine: "Punjabi", category: "Main",     selling_price: 220, food_cost: 77,    margin: 143,   margin_pct: 65,  popularity: 55,  revenue: 220,  prep_time: 25, prep_eff: 5.72,  elasticity: 0.18, trend_score: 0,  is_veg: true,  quadrant: "Risk" },
  { name: "Butter Chicken",         cuisine: "Punjabi", category: "Main",     selling_price: 380, food_cost: 133,   margin: 247,   margin_pct: 65,  popularity: 100, revenue: 1140, prep_time: 20, prep_eff: 12.35, elasticity: 0.21, trend_score: 42, is_veg: false, quadrant: "Star" },
  { name: "Paneer Butter Masala",   cuisine: "Punjabi", category: "Main",     selling_price: 340, food_cost: 119,   margin: 221,   margin_pct: 65,  popularity: 65,  revenue: 0,    prep_time: 18, prep_eff: 12.28, elasticity: 0.25, trend_score: 18, is_veg: true,  quadrant: "Star" },
  { name: "Sarson Ka Saag",         cuisine: "Punjabi", category: "Main",     selling_price: 260, food_cost: 91,    margin: 169,   margin_pct: 65,  popularity: 32,  revenue: 260,  prep_time: 30, prep_eff: 5.63,  elasticity: 0.30, trend_score: 0,  is_veg: true,  quadrant: "Hidden Star" },
  { name: "Kadhai Chicken",         cuisine: "Punjabi", category: "Main",     selling_price: 360, food_cost: 126,   margin: 234,   margin_pct: 65,  popularity: 48,  revenue: 360,  prep_time: 22, prep_eff: 10.64, elasticity: 0.22, trend_score: 0,  is_veg: false, quadrant: "Hidden Star" },
  { name: "Butter Naan",            cuisine: "Punjabi", category: "Bread",    selling_price: 90,  food_cost: 27,    margin: 63,    margin_pct: 70,  popularity: 95,  revenue: 720,  prep_time: 10, prep_eff: 6.30,  elasticity: 0.15, trend_score: 38, is_veg: true,  quadrant: "Risk" },
  { name: "Makki di Roti",          cuisine: "Punjabi", category: "Bread",    selling_price: 100, food_cost: 30,    margin: 70,    margin_pct: 70,  popularity: 42,  revenue: 200,  prep_time: 12, prep_eff: 5.83,  elasticity: 0.12, trend_score: 0,  is_veg: true,  quadrant: "Dog" },
  { name: "Sweet Lassi",            cuisine: "Punjabi", category: "Beverage", selling_price: 120, food_cost: 36,    margin: 84,    margin_pct: 70,  popularity: 60,  revenue: 360,  prep_time: 5,  prep_eff: 16.80, elasticity: 0.18, trend_score: 0,  is_veg: true,  quadrant: "Risk" },
  { name: "Gulab Jamun",            cuisine: "Punjabi", category: "Dessert",  selling_price: 150, food_cost: 45,    margin: 105,   margin_pct: 70,  popularity: 58,  revenue: 450,  prep_time: 5,  prep_eff: 21.00, elasticity: 0.20, trend_score: 0,  is_veg: true,  quadrant: "Risk" },
  { name: "Bruschetta al Pomodoro", cuisine: "Italian", category: "Starter",  selling_price: 180, food_cost: 54,    margin: 126,   margin_pct: 70,  popularity: 22,  revenue: 180,  prep_time: 10, prep_eff: 12.60, elasticity: 0.42, trend_score: 0,  is_veg: true,  quadrant: "Dog" },
  { name: "Soup del Giorno",        cuisine: "Italian", category: "Starter",  selling_price: 160, food_cost: 48,    margin: 112,   margin_pct: 70,  popularity: 12,  revenue: 0,    prep_time: 10, prep_eff: 11.20, elasticity: 0.38, trend_score: 0,  is_veg: true,  quadrant: "Dog" },
  { name: "Margherita Pizza",       cuisine: "Italian", category: "Main",     selling_price: 420, food_cost: 147,   margin: 273,   margin_pct: 65,  popularity: 85,  revenue: 840,  prep_time: 20, prep_eff: 13.65, elasticity: 0.23, trend_score: 28, is_veg: true,  quadrant: "Star" },
  { name: "Pasta Arrabbiata",       cuisine: "Italian", category: "Main",     selling_price: 320, food_cost: 96,    margin: 224,   margin_pct: 70,  popularity: 62,  revenue: 640,  prep_time: 15, prep_eff: 14.93, elasticity: 0.26, trend_score: 20, is_veg: true,  quadrant: "Star" },
  { name: "Chicken Alfredo Pasta",  cuisine: "Italian", category: "Main",     selling_price: 450, food_cost: 157.5, margin: 292.5, margin_pct: 65,  popularity: 45,  revenue: 450,  prep_time: 18, prep_eff: 16.25, elasticity: 0.28, trend_score: 0,  is_veg: false, quadrant: "Hidden Star" },
  { name: "Wood-fired Chicken Pizza",cuisine: "Italian",category: "Main",     selling_price: 520, food_cost: 182,   margin: 338,   margin_pct: 65,  popularity: 40,  revenue: 520,  prep_time: 22, prep_eff: 15.36, elasticity: 0.19, trend_score: 0,  is_veg: false, quadrant: "Hidden Star" },
  { name: "Tiramisu",               cuisine: "Italian", category: "Dessert",  selling_price: 250, food_cost: 87.5,  margin: 162.5, margin_pct: 65,  popularity: 35,  revenue: 500,  prep_time: 5,  prep_eff: 32.50, elasticity: 0.35, trend_score: 0,  is_veg: true,  quadrant: "Hidden Star" },
];

const peakHours = [
  { hour: 12, orders: 5 }, { hour: 13, orders: 3 }, { hour: 17, orders: 3 },
  { hour: 19, orders: 3 }, { hour: 20, orders: 13 },
];
const dailyRevenue = [
  { date: "2025-11-10", revenue: 670 }, { date: "2025-12-05", revenue: 666 },
  { date: "2025-12-18", revenue: 580 }, { date: "2026-01-15", revenue: 490 },
  { date: "2026-01-22", revenue: 768 }, { date: "2026-01-30", revenue: 666 },
  { date: "2026-02-08", revenue: 490 }, { date: "2026-02-20", revenue: 738 },
  { date: "2026-03-01", revenue: 870 }, { date: "2026-03-05", revenue: 656 },
];
const dayRevenue = [
  { day: "Monday", revenue: 670 }, { day: "Thursday", revenue: 3160 },
  { day: "Friday", revenue: 1404 }, { day: "Sunday", revenue: 1360 },
];
const combos = [
  { combo: "Butter Chicken + Butter Naan", confidence: 0.72, orders: 42, margin: 322 },
  { combo: "Paneer Tikka + Sweet Lassi + Gulab Jamun", confidence: 0.54, orders: 24, margin: 277 },
  { combo: "Margherita Pizza + Pasta Arrabbiata", confidence: 0.61, orders: 18, margin: 353 },
];
const customers = [
  { name: "Arjun Mehta", segment: "LOYAL", visits: 6, avg_order: 640, preferred: "Punjabi Main Course" },
  { name: "Priya Shah",  segment: "REGULAR", visits: 4, avg_order: 560, preferred: "Italian Mains" },
  { name: "Ravi Patel",  segment: "REGULAR", visits: 2, avg_order: 490, preferred: "Punjabi Starters" },
];
const offers = [
  { trigger: "Cart >= 500", discount: "10%", channel: "all" },
  { trigger: "Cart >= 900", discount: "20%", channel: "all" },
];

const totalRev = dailyRevenue.reduce((s, d) => s + d.revenue, 0);
const avgDailyRev = Math.round(totalRev / dailyRevenue.length);

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic query engine
// ─────────────────────────────────────────────────────────────────────────────

function fmt(n: number): string { return n % 1 === 0 ? n.toLocaleString("en-IN") : n.toFixed(2); }

function extractCount(msg: string): number {
  const m = msg.match(/\btop\s+(\d+)/i) || msg.match(/\b(\d+)\s+(best|top|highest|most|lowest|cheapest|least|worst)/i) || msg.match(/\b(best|top|highest|most|lowest|cheapest|least|worst)\s+(\d+)/i);
  if (m) return parseInt(m[1]) || parseInt(m[2]) || 5;
  return 0; // 0 means show all relevant
}

function wantsBottom(msg: string): boolean {
  return /\b(lowest|cheapest|least|worst|bottom|minimum|min|poor|underperform|low\b|slow|dog)/i.test(msg);
}

function itemTable(list: Item[], columns: { header: string; value: (i: Item) => string }[]): string {
  const hdr = "| # | Item | " + columns.map(c => c.header).join(" | ") + " |";
  const sep = "|---|------|" + columns.map(() => "---").join("|") + "|";
  const rows = list.map((it, idx) =>
    `| ${idx + 1} | **${it.name}** | ${columns.map(c => c.value(it)).join(" | ")} |`
  ).join("\n");
  return hdr + "\n" + sep + "\n" + rows;
}

function answerQuery(msg: string): string {
  const low = msg.toLowerCase();
  const count = extractCount(msg);
  const bottom = wantsBottom(msg);

  // ── Specific item lookup ──
  const matchedItems = items.filter(it => low.includes(it.name.toLowerCase()));
  if (matchedItems.length > 0 && !(/\b(top|best|worst|all|list|compare)\b/i.test(low))) {
    return matchedItems.map(it => {
      const combo = combos.find(c => c.combo.toLowerCase().includes(it.name.toLowerCase()));
      return `## ${it.name}\n\n| Metric | Value |\n|--------|-------|\n| **Selling Price** | Rs.${fmt(it.selling_price)} |\n| **Food Cost** | Rs.${fmt(it.food_cost)} |\n| **Margin** | Rs.${fmt(it.margin)} (${it.margin_pct}%) |\n| **Popularity** | ${it.popularity}/100 |\n| **Revenue** | Rs.${fmt(it.revenue)} |\n| **Kitchen Efficiency** | Rs.${fmt(it.prep_eff)}/min |\n| **Price Elasticity** | ${it.elasticity} |\n| **Trend Score** | ${it.trend_score || "N/A"} |\n| **Cuisine** | ${it.cuisine} |\n| **Category** | ${it.category} |\n| **Veg** | ${it.is_veg ? "Yes" : "No"} |\n| **Quadrant** | ${it.quadrant} |` +
        (combo ? `\n\n**Frequently ordered with:** ${combo.combo} (${(combo.confidence * 100).toFixed(0)}% of orders, margin Rs.${fmt(combo.margin)})` : "");
    }).join("\n\n---\n\n");
  }

  // ── Price / expensive / cheap queries ──
  if (/\b(price|priced|expensive|costly|cheap|affordable)\b/i.test(low)) {
    const sorted = [...items].sort((a, b) => bottom || /cheap|affordable/i.test(low) ? a.selling_price - b.selling_price : b.selling_price - a.selling_price);
    const n = count || 5;
    const slice = sorted.slice(0, n);
    const label = (bottom || /cheap|affordable/i.test(low)) ? `${n} Lowest Priced Items` : `${n} Highest Priced Items`;
    return `## ${label}\n\n` + itemTable(slice, [
      { header: "Price", value: i => `Rs.${fmt(i.selling_price)}` },
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Cuisine", value: i => i.cuisine },
      { header: "Category", value: i => i.category },
    ]);
  }

  // ── Selling / popular / best-seller queries ──
  if (/\b(sell|selling|popular|best.?seller|ordered|demand)\b/i.test(low)) {
    const sorted = [...items].sort((a, b) => bottom ? a.popularity - b.popularity : b.popularity - a.popularity);
    const n = count || 5;
    const slice = sorted.slice(0, n);
    const label = bottom ? `${n} Least Popular Items` : `${n} Top Selling Items (by popularity)`;
    return `## ${label}\n\n` + itemTable(slice, [
      { header: "Popularity", value: i => `${i.popularity}/100` },
      { header: "Revenue", value: i => `Rs.${fmt(i.revenue)}` },
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Price", value: i => `Rs.${fmt(i.selling_price)}` },
    ]) + `\n\nPopularity is scored 0-100 based on order frequency over the last 30 days.`;
  }

  // ── Revenue / earning queries ──
  if (/\b(revenue|earning|income|sales|money)\b/i.test(low)) {
    // "increase revenue" / "boost revenue" => actionable advice
    if (/\b(increase|boost|grow|improve|raise|maximize)\b/i.test(low)) {
      const gold = items.filter(i => i.quadrant === "Hidden Star").sort((a, b) => b.margin - a.margin).slice(0, 3);
      const bestDay = [...dayRevenue].sort((a, b) => b.revenue - a.revenue)[0];
      const worstDay = [...dayRevenue].sort((a, b) => a.revenue - b.revenue)[0];
      return `## Revenue Growth Strategies\n\n**Current avg daily revenue:** Rs.${fmt(avgDailyRev)}\n\n### 1. Push Hidden Gold Items\nThese have high margins but low popularity — each extra sale is pure profit:\n${gold.map((g, i) => `${i + 1}. **${g.name}** — Rs.${fmt(g.margin)} margin, only ${g.popularity} popularity`).join("\n")}\n\n### 2. Optimize Weak Days\n- **${worstDay.day}** earns only Rs.${fmt(worstDay.revenue)} vs **${bestDay.day}** at Rs.${fmt(bestDay.revenue)}\n- Run a "${worstDay.day} Special" with 15% off combos to drive traffic\n\n### 3. Leverage Peak Hours\n- 8 PM has **13 orders** — deploy upsell scripts during this window\n- Staff should suggest high-margin items like Wood-fired Chicken Pizza (Rs.${fmt(338)} margin)\n\n### 4. Promote Combos\n- "${combos[0].combo}" has 72% natural pairing rate — bundle it at a slight discount\n- Estimated impact: 5 extra combos/day = Rs.${fmt(combos[0].margin * 5)}/day additional margin\n\n### 5. Price Adjustments\n- Items like Makki di Roti (elasticity 0.12) and Butter Naan (0.15) can absorb Rs.10-15 price increases with minimal demand impact`;
    }
    // revenue by item
    if (/\b(item|menu|which|highest|top|most)\b/i.test(low)) {
      const sorted = [...items].filter(i => i.revenue > 0).sort((a, b) => bottom ? a.revenue - b.revenue : b.revenue - a.revenue);
      const n = count || 10;
      const slice = sorted.slice(0, n);
      return `## Items by Revenue\n\n` + itemTable(slice, [
        { header: "Revenue", value: i => `Rs.${fmt(i.revenue)}` },
        { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
        { header: "Popularity", value: i => `${i.popularity}/100` },
      ]) + `\n\n**Total tracked revenue:** Rs.${fmt(totalRev)} | **Avg daily:** Rs.${fmt(avgDailyRev)}`;
    }
    // daily revenue overview
    const best = dailyRevenue.reduce((a, b) => a.revenue > b.revenue ? a : b);
    const worst = dailyRevenue.reduce((a, b) => a.revenue < b.revenue ? a : b);
    return `## Revenue Overview\n\n**Total tracked revenue:** Rs.${fmt(totalRev)} | **Avg daily:** Rs.${fmt(avgDailyRev)}\n**Best day:** ${best.date} at Rs.${fmt(best.revenue)} | **Worst day:** ${worst.date} at Rs.${fmt(worst.revenue)}\n\n### Daily Revenue\n| Date | Revenue |\n|------|---------|\n${dailyRevenue.map(d => `| ${d.date} | Rs.${fmt(d.revenue)} |`).join("\n")}\n\n### By Day of Week\n${dayRevenue.sort((a,b) => b.revenue - a.revenue).map((d,i) => `${i+1}. **${d.day}** — Rs.${fmt(d.revenue)}`).join("\n")}`;
  }

  // ── Margin queries ──
  if (/\b(margin|profit|profitable|profitab)\b/i.test(low)) {
    const sorted = [...items].sort((a, b) => bottom ? a.margin - b.margin : b.margin - a.margin);
    const n = count || 5;
    const slice = sorted.slice(0, n);
    const label = bottom ? `${n} Lowest Margin Items` : `${n} Highest Margin Items`;
    return `## ${label}\n\n` + itemTable(slice, [
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Price", value: i => `Rs.${fmt(i.selling_price)}` },
      { header: "Food Cost", value: i => `Rs.${fmt(i.food_cost)}` },
      { header: "Popularity", value: i => `${i.popularity}/100` },
    ]);
  }

  // ── Hidden Gold / untapped ──
  if (/\b(hidden\s*gold|untapped|underrated)\b/i.test(low)) {
    const gold = items.filter(i => i.quadrant === "Hidden Star").sort((a, b) => b.prep_eff - a.prep_eff);
    return `## Hidden Gold Items\n\nHigh margin but low popularity — your biggest untapped opportunity.\n\n` + itemTable(gold, [
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Popularity", value: i => `${i.popularity}/100` },
      { header: "Efficiency", value: i => `Rs.${fmt(i.prep_eff)}/min` },
      { header: "Price", value: i => `Rs.${fmt(i.selling_price)}` },
    ]) + `\n\nThese items earn well per kitchen-minute but aren't ordered enough. Promote them through staff recommendations, menu placement, or special features.`;
  }

  // ── Combos ──
  if (/\b(combos?|bundles?|pair|together|cross.?sell|frequently.*bought|promot.*combo)/i.test(low)) {
    return `## Combo Analysis\n\n${combos.map((c, i) => `### ${i + 1}. ${c.combo}\n- **Confidence:** ${(c.confidence * 100).toFixed(0)}% of customers order these together\n- **Order count:** ${c.orders}\n- **Combined margin:** Rs.${fmt(c.margin)}`).join("\n\n")}\n\nBundling these as meal deals can increase average order value and margin per transaction.`;
  }

  // ── Elasticity / price safety ──
  if (/\b(elastic|inelastic|safely\s*raise|price\s*signal|price\s*sensitiv)\b/i.test(low)) {
    const safe = [...items].sort((a, b) => a.elasticity - b.elasticity).slice(0, 5);
    const risky = [...items].sort((a, b) => b.elasticity - a.elasticity).slice(0, 5);
    return `## Price Sensitivity Analysis\n\n### Safe to Raise (Low Elasticity)\n` + itemTable(safe, [
      { header: "Elasticity", value: i => `${i.elasticity}` },
      { header: "Price", value: i => `Rs.${fmt(i.selling_price)}` },
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
    ]) + `\n\nLow elasticity means customers are less sensitive to price changes on these items.\n\n### Risky to Raise (High Elasticity)\n` + itemTable(risky, [
      { header: "Elasticity", value: i => `${i.elasticity}` },
      { header: "Price", value: i => `Rs.${fmt(i.selling_price)}` },
      { header: "Popularity", value: i => `${i.popularity}/100` },
    ]) + `\n\nHigh elasticity items will lose orders if price increases.`;
  }

  // ── Upsell ──
  if (/\b(upsell|push\s*tonight|suggest\s*tonight|recommend\s*tonight)\b/i.test(low)) {
    const targets = items.filter(i => i.margin >= 200 && i.popularity < 60).sort((a, b) => b.margin - a.margin).slice(0, 5);
    return `## Upsell Recommendations\n\nItems with high margin but low popularity — each extra sale is significant.\n\n` + itemTable(targets, [
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Popularity", value: i => `${i.popularity}/100` },
      { header: "Price", value: i => `Rs.${fmt(i.selling_price)}` },
    ]) + `\n\nAlso push the **${combos[0].combo}** combo (Rs.${fmt(combos[0].margin)} margin, ${(combos[0].confidence * 100).toFixed(0)}% natural pairing).`;
  }

  // ── Trending ──
  if (/\b(trend|trending|rising|growing|momentum)\b/i.test(low)) {
    const trending = items.filter(i => i.trend_score > 0).sort((a, b) => b.trend_score - a.trend_score);
    return `## Trending Items\n\n` + itemTable(trending, [
      { header: "Trend Score", value: i => `${i.trend_score}` },
      { header: "Popularity", value: i => `${i.popularity}/100` },
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Revenue", value: i => `Rs.${fmt(i.revenue)}` },
    ]) + `\n\nTrend score measures recent demand acceleration. Ensure stock and quality for high-trending items.`;
  }

  // ── Peak hours ──
  if (/\b(peak|busy|rush\s*hour|busiest|when.*order)\b/i.test(low)) {
    const totalOrders = peakHours.reduce((s, p) => s + p.orders, 0);
    const peak = peakHours.reduce((a, b) => a.orders > b.orders ? a : b);
    return `## Peak Order Hours\n\n| Time | Orders | Share |\n|------|--------|-------|\n${peakHours.map(p => `| ${p.hour}:00 | ${p.orders} | ${((p.orders / totalOrders) * 100).toFixed(0)}% |`).join("\n")}\n\nPeak hour is **${peak.hour}:00** with **${peak.orders} orders** (${((peak.orders / totalOrders) * 100).toFixed(0)}% of volume). Focus upselling efforts here for maximum impact.`;
  }

  // ── Day of week ──
  if (/\b(day|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekly|which\s*day|best\s*day|worst\s*day)\b/i.test(low)) {
    const sorted = [...dayRevenue].sort((a, b) => b.revenue - a.revenue);
    // specific day asked?
    const dayMatch = low.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (dayMatch) {
      const dayName = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1).toLowerCase();
      const found = dayRevenue.find(d => d.day.toLowerCase() === dayMatch[1].toLowerCase());
      if (found) {
        const rank = sorted.findIndex(d => d.day === found.day) + 1;
        const best = sorted[0];
        return `## ${found.day} Revenue\n\n**Revenue:** Rs.${fmt(found.revenue)} | **Rank:** ${rank}${rank === 1 ? " (best)" : rank === sorted.length ? " (lowest)" : ""} of ${sorted.length} tracked days\n\n${found.day === best.day ? "This is your strongest day. Keep running premium specials." : `Compared to your best day (${best.day} at Rs.${fmt(best.revenue)}), ${dayName} is Rs.${fmt(best.revenue - found.revenue)} behind.\n\nConsider running a "${dayName} Special" promotion or loyalty double-points to drive traffic.`}\n\n### All Days\n${sorted.map((d, i) => `${i + 1}. **${d.day}** — Rs.${fmt(d.revenue)}`).join("\n")}`;
      }
    }
    return `## Revenue by Day of Week\n\n${sorted.map((d, i) => `${i + 1}. **${d.day}** — Rs.${fmt(d.revenue)}`).join("\n")}\n\n**${sorted[0].day}** is your best day. **${sorted[sorted.length - 1].day}** needs attention — consider special promotions to boost traffic.`;
  }

  // ── Customers ──
  if (/\b(customer|segment|loyal|regular|vip|visitor)\b/i.test(low)) {
    return `## Customer Segments\n\n| Customer | Segment | Visits | Avg Order | Preference |\n|----------|---------|--------|-----------|------------|\n${customers.map(c => `| **${c.name}** | ${c.segment} | ${c.visits} | Rs.${fmt(c.avg_order)} | ${c.preferred} |`).join("\n")}\n\nAverage ticket size: Rs.${fmt(Math.round(customers.reduce((s, c) => s + c.avg_order, 0) / customers.length))}\n\n**LOYAL customers** should get exclusive rewards. **REGULAR customers** can be converted with frequency incentives like "3rd visit free dessert".`;
  }

  // ── Offers / discounts ──
  if (/\b(offer|discount|promotion|deal|coupon)\b/i.test(low)) {
    return `## Active Offers\n\n${offers.map((o, i) => `${i + 1}. **${o.trigger}** — ${o.discount} off (channel: ${o.channel})`).join("\n")}\n\nThese thresholds are designed to push average ticket sizes. When a customer is close to a threshold, suggest an add-on to unlock the discount.`;
  }

  // ── Veg / non-veg filter ──
  if (/\b(veg|vegetarian|non.?veg|non.?vegetarian)\b/i.test(low)) {
    const isNonVeg = /non.?veg/i.test(low);
    const filtered = items.filter(i => isNonVeg ? !i.is_veg : i.is_veg);
    const sorted = filtered.sort((a, b) => b.popularity - a.popularity);
    const n = count || sorted.length;
    return `## ${isNonVeg ? "Non-Vegetarian" : "Vegetarian"} Items\n\n` + itemTable(sorted.slice(0, n), [
      { header: "Price", value: i => `Rs.${fmt(i.selling_price)}` },
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Popularity", value: i => `${i.popularity}/100` },
      { header: "Cuisine", value: i => i.cuisine },
    ]);
  }

  // ── Cuisine filter ──
  if (/\b(punjabi|italian)\b/i.test(low)) {
    const cuisine = /italian/i.test(low) ? "Italian" : "Punjabi";
    const filtered = items.filter(i => i.cuisine === cuisine).sort((a, b) => b.popularity - a.popularity);
    const n = count || filtered.length;
    return `## ${cuisine} Items\n\n` + itemTable(filtered.slice(0, n), [
      { header: "Price", value: i => `Rs.${fmt(i.selling_price)}` },
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Popularity", value: i => `${i.popularity}/100` },
      { header: "Category", value: i => i.category },
    ]);
  }

  // ── Category filter ──
  if (/\b(starter|appetizer|main\s*course|main|bread|roti|naan|beverage|drink|dessert|sweet)\b/i.test(low)) {
    let category = "Main";
    if (/starter|appetizer/i.test(low)) category = "Starter";
    else if (/bread|roti|naan/i.test(low)) category = "Bread";
    else if (/beverage|drink|lassi/i.test(low)) category = "Beverage";
    else if (/dessert|sweet/i.test(low)) category = "Dessert";
    const filtered = items.filter(i => i.category === category).sort((a, b) => b.popularity - a.popularity);
    const n = count || filtered.length;
    return `## ${category} Items\n\n` + itemTable(filtered.slice(0, n), [
      { header: "Price", value: i => `Rs.${fmt(i.selling_price)}` },
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Popularity", value: i => `${i.popularity}/100` },
      { header: "Cuisine", value: i => i.cuisine },
    ]);
  }

  // ── Low performers / dogs ──
  if (/\b(low\s*perform|worst|poor|dog|remove|cut.*menu|underperform|slow|flop)\b/i.test(low)) {
    const dogs = items.filter(i => i.quadrant === "Dog");
    const lowPop = [...items].sort((a, b) => a.popularity - b.popularity).slice(0, 5);
    return `## Low Performers\n\n### Dog Quadrant (Low Popularity + Low Margin)\n${dogs.length > 0 ? itemTable(dogs, [
      { header: "Popularity", value: i => `${i.popularity}/100` },
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Revenue", value: i => `Rs.${fmt(i.revenue)}` },
    ]) : "No items in Dog quadrant."}\n\n### Least Popular Overall\n` + itemTable(lowPop, [
      { header: "Popularity", value: i => `${i.popularity}/100` },
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Quadrant", value: i => i.quadrant },
    ]) + `\n\nDog items should be considered for removal or recipe rework. Items with low popularity but high margin (Hidden Star) should be promoted instead.`;
  }

  // ── Prep time / kitchen / efficiency ──
  if (/\b(prep|kitchen|efficien|fast|slow|time|cook)\b/i.test(low)) {
    const sorted = [...items].sort((a, b) => bottom ? a.prep_eff - b.prep_eff : b.prep_eff - a.prep_eff);
    const n = count || 5;
    return `## Kitchen Efficiency\n\n` + itemTable(sorted.slice(0, n), [
      { header: "Rs./Min", value: i => `Rs.${fmt(i.prep_eff)}` },
      { header: "Prep Time", value: i => `${i.prep_time} min` },
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Popularity", value: i => `${i.popularity}/100` },
    ]) + `\n\nHigher Rs./min means the item earns more margin per minute of kitchen time.`;
  }

  // ── Quadrant / BCG ──
  if (/\b(quadrant|star|bcg|matrix|classify|classif)\b/i.test(low)) {
    const groups: Record<string, Item[]> = {};
    for (const it of items) {
      if (!groups[it.quadrant]) groups[it.quadrant] = [];
      groups[it.quadrant].push(it);
    }
    let result = "## Menu Quadrant Analysis\n\n";
    for (const [q, list] of Object.entries(groups)) {
      result += `### ${q}\n` + itemTable(list, [
        { header: "Popularity", value: i => `${i.popularity}/100` },
        { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      ]) + "\n\n";
    }
    return result + "**Stars:** Promote heavily. **Hidden Stars:** Push through recommendations. **Risk:** Optimize cost or raise price. **Dog:** Consider removing.";
  }

  // ── Menu / all items / list ──
  if (/\b(menu|all\s*item|list|full|everything|catalog)\b/i.test(low)) {
    return `## Full Menu — Tadka & Twist\n\n` + itemTable(items, [
      { header: "Price", value: i => `Rs.${fmt(i.selling_price)}` },
      { header: "Margin", value: i => `Rs.${fmt(i.margin)}` },
      { header: "Popularity", value: i => `${i.popularity}/100` },
      { header: "Cuisine", value: i => i.cuisine },
      { header: "Quadrant", value: i => i.quadrant },
    ]);
  }

  // ── Promote today / action ──
  if (/\b(today|tonight|action|focus|what.*do|suggest|recommend|promote|promoting|promotion)\b/i.test(low)) {
    const now = new Date();
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()];
    const gold = items.filter(i => i.quadrant === "Hidden Star").sort((a, b) => b.margin - a.margin).slice(0, 3);
    return `## Today's Action Plan (${dayName})\n\n### Items to Push\n${gold.map((g, i) => `${i + 1}. **${g.name}** — Rs.${fmt(g.margin)} margin, only ${g.popularity} popularity`).join("\n")}\n\n### Combo to Promote\n**${combos[0].combo}** — Rs.${fmt(combos[0].margin)} margin, ${(combos[0].confidence * 100).toFixed(0)}% natural pairing\n\n### Peak Focus\nConcentrate upselling at **8 PM** (highest order volume). Deploy staff recommendations for high-margin items during this window.`;
  }

  // ── General / greeting / help ──
  return `## Revenue Copilot — Tadka & Twist\n\nAsk me anything about your restaurant data. Here are some examples:\n\n- "What are my top 5 selling items?"\n- "Show me the highest priced items"\n- "Which items have the best margin?"\n- "What combos should I promote?"\n- "How can I increase revenue?"\n- "Tell me about Butter Chicken"\n- "Show me all vegetarian items"\n- "What are my peak hours?"\n- "Which day has the lowest revenue?"\n- "Show me Italian items"\n- "What are my low performers?"\n- "Kitchen efficiency ranking"\n\n**Quick Stats:**\n- Avg daily revenue: Rs.${fmt(avgDailyRev)}\n- Menu items: ${items.length}\n- Best seller: ${items.reduce((a, b) => a.popularity > b.popularity ? a : b).name} (popularity 100)\n- Highest margin: ${items.reduce((a, b) => a.margin > b.margin ? a : b).name} (Rs.${fmt(items.reduce((a, b) => a.margin > b.margin ? a : b).margin)})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  let body: { message: string; history?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message } = body;
  if (!message || typeof message !== "string" || message.length > 2000) {
    return NextResponse.json({ error: "message is required (max 2000 chars)" }, { status: 400 });
  }

  const reply = answerQuery(message);
  return NextResponse.json({ reply });
}
