"use client";

import ReactECharts from "echarts-for-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface HiddenGoldDataPoint {
  item_name: string;
  popularity_score: number;
  cm_per_prep_min: number;
}

interface HighestSellingDayDataPoint {
  day_of_week: string;
  revenue: number;
}

interface TrendingItemDataPoint {
  item_name: string;
  trend_score: number;
}

interface PeakOrderHoursDataPoint {
  hour: number;
  order_count: number;
}

interface PriceSignalDataPoint {
  item_name: string;
  elasticity_index: number;
}

interface DailyRevenueDataPoint {
  date: string;
  revenue: number;
}

interface ItemContributionDataPoint {
  item_name: string;
  revenue: number;
}

interface DemandMarginDataPoint {
  item_name: string;
  popularity_score: number;
  cm_rupees: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL DATA  (sourced from 003_seed_data.sql → revenue_scores + order tables)
// ─────────────────────────────────────────────────────────────────────────────

const demandMarginData: DemandMarginDataPoint[] = [
  { item_name: "Butter Chicken",           popularity_score: 100, cm_rupees: 247.00 },
  { item_name: "Butter Naan",              popularity_score: 95,  cm_rupees: 63.00  },
  { item_name: "Margherita Pizza",         popularity_score: 85,  cm_rupees: 273.00 },
  { item_name: "Paneer Tikka",             popularity_score: 72,  cm_rupees: 182.00 },
  { item_name: "Paneer Butter Masala",     popularity_score: 65,  cm_rupees: 221.00 },
  { item_name: "Pasta Arrabbiata",         popularity_score: 62,  cm_rupees: 224.00 },
  { item_name: "Sweet Lassi",              popularity_score: 60,  cm_rupees: 84.00  },
  { item_name: "Gulab Jamun",              popularity_score: 58,  cm_rupees: 105.00 },
  { item_name: "Dal Makhani",              popularity_score: 55,  cm_rupees: 143.00 },
  { item_name: "Kadhai Chicken",           popularity_score: 48,  cm_rupees: 234.00 },
  { item_name: "Chicken Alfredo Pasta",    popularity_score: 45,  cm_rupees: 292.50 },
  { item_name: "Makki di Roti",            popularity_score: 42,  cm_rupees: 70.00  },
  { item_name: "Wood-fired Chicken Pizza", popularity_score: 40,  cm_rupees: 338.00 },
  { item_name: "Chicken Tikka",            popularity_score: 38,  cm_rupees: 208.00 },
  { item_name: "Tiramisu",                 popularity_score: 35,  cm_rupees: 162.50 },
  { item_name: "Sarson Ka Saag",           popularity_score: 32,  cm_rupees: 169.00 },
  { item_name: "Bruschetta al Pomodoro",   popularity_score: 22,  cm_rupees: 126.00 },
  { item_name: "Soup del Giorno",          popularity_score: 12,  cm_rupees: 112.00 },
  { item_name: "Amritsari Fish Fry",       popularity_score: 10,  cm_rupees: 227.50 },
];

const highestSellingDayData: HighestSellingDayDataPoint[] = [
  { day_of_week: "Monday",   revenue: 670  },
  { day_of_week: "Thursday", revenue: 3160 },
  { day_of_week: "Friday",   revenue: 1404 },
  { day_of_week: "Sunday",   revenue: 1360 },
];

const trendingItemsData: TrendingItemDataPoint[] = [
  { item_name: "Butter Chicken",       trend_score: 42 },
  { item_name: "Butter Naan",          trend_score: 38 },
  { item_name: "Margherita Pizza",     trend_score: 28 },
  { item_name: "Pasta Arrabbiata",     trend_score: 20 },
  { item_name: "Paneer Butter Masala", trend_score: 18 },
];

const peakOrderHoursData: PeakOrderHoursDataPoint[] = [
  { hour: 12, order_count: 5  },
  { hour: 13, order_count: 3  },
  { hour: 17, order_count: 3  },
  { hour: 19, order_count: 3  },
  { hour: 20, order_count: 13 },
];

const priceSignalData: PriceSignalDataPoint[] = [
  { item_name: "Makki di Roti",            elasticity_index: 0.12 },
  { item_name: "Butter Naan",              elasticity_index: 0.15 },
  { item_name: "Sweet Lassi",              elasticity_index: 0.18 },
  { item_name: "Dal Makhani",              elasticity_index: 0.18 },
  { item_name: "Wood-fired Chicken Pizza", elasticity_index: 0.19 },
  { item_name: "Gulab Jamun",              elasticity_index: 0.20 },
  { item_name: "Butter Chicken",           elasticity_index: 0.21 },
  { item_name: "Kadhai Chicken",           elasticity_index: 0.22 },
  { item_name: "Margherita Pizza",         elasticity_index: 0.23 },
  { item_name: "Paneer Butter Masala",     elasticity_index: 0.25 },
  { item_name: "Pasta Arrabbiata",         elasticity_index: 0.26 },
  { item_name: "Chicken Alfredo Pasta",    elasticity_index: 0.28 },
  { item_name: "Chicken Tikka",            elasticity_index: 0.28 },
  { item_name: "Sarson Ka Saag",           elasticity_index: 0.30 },
  { item_name: "Paneer Tikka",             elasticity_index: 0.32 },
  { item_name: "Amritsari Fish Fry",       elasticity_index: 0.35 },
  { item_name: "Tiramisu",                 elasticity_index: 0.35 },
  { item_name: "Soup del Giorno",          elasticity_index: 0.38 },
  { item_name: "Bruschetta al Pomodoro",   elasticity_index: 0.42 },
];

const dailyRevenueData: DailyRevenueDataPoint[] = [
  { date: "2025-11-10", revenue: 670 },
  { date: "2025-12-05", revenue: 666 },
  { date: "2025-12-18", revenue: 580 },
  { date: "2026-01-15", revenue: 490 },
  { date: "2026-01-22", revenue: 768 },
  { date: "2026-01-30", revenue: 666 },
  { date: "2026-02-08", revenue: 490 },
  { date: "2026-02-20", revenue: 738 },
  { date: "2026-03-01", revenue: 870 },
  { date: "2026-03-05", revenue: 656 },
];

const itemContributionData: ItemContributionDataPoint[] = [
  { item_name: "Butter Chicken",           revenue: 1140 },
  { item_name: "Margherita Pizza",         revenue: 840  },
  { item_name: "Butter Naan",              revenue: 720  },
  { item_name: "Pasta Arrabbiata",         revenue: 640  },
  { item_name: "Paneer Tikka",             revenue: 560  },
  { item_name: "Wood-fired Chicken Pizza", revenue: 520  },
  { item_name: "Tiramisu",                 revenue: 500  },
  { item_name: "Chicken Alfredo Pasta",    revenue: 450  },
  { item_name: "Gulab Jamun",              revenue: 450  },
  { item_name: "Kadhai Chicken",           revenue: 360  },
  { item_name: "Sweet Lassi",              revenue: 360  },
  { item_name: "Sarson Ka Saag",           revenue: 260  },
  { item_name: "Dal Makhani",              revenue: 220  },
  { item_name: "Makki di Roti",            revenue: 200  },
  { item_name: "Bruschetta al Pomodoro",   revenue: 180  },
];

const hiddenGoldData: HiddenGoldDataPoint[] = [
  { item_name: "Butter Chicken",           popularity_score: 100, cm_per_prep_min: 12.35 },
  { item_name: "Butter Naan",              popularity_score: 95,  cm_per_prep_min: 6.30  },
  { item_name: "Margherita Pizza",         popularity_score: 85,  cm_per_prep_min: 13.65 },
  { item_name: "Paneer Tikka",             popularity_score: 72,  cm_per_prep_min: 12.13 },
  { item_name: "Paneer Butter Masala",     popularity_score: 65,  cm_per_prep_min: 12.28 },
  { item_name: "Pasta Arrabbiata",         popularity_score: 62,  cm_per_prep_min: 14.93 },
  { item_name: "Sweet Lassi",              popularity_score: 60,  cm_per_prep_min: 16.80 },
  { item_name: "Gulab Jamun",              popularity_score: 58,  cm_per_prep_min: 21.00 },
  { item_name: "Dal Makhani",              popularity_score: 55,  cm_per_prep_min: 5.72  },
  { item_name: "Kadhai Chicken",           popularity_score: 48,  cm_per_prep_min: 10.64 },
  { item_name: "Chicken Alfredo Pasta",    popularity_score: 45,  cm_per_prep_min: 16.25 },
  { item_name: "Makki di Roti",            popularity_score: 42,  cm_per_prep_min: 5.83  },
  { item_name: "Wood-fired Chicken Pizza", popularity_score: 40,  cm_per_prep_min: 15.36 },
  { item_name: "Chicken Tikka",            popularity_score: 38,  cm_per_prep_min: 11.56 },
  { item_name: "Tiramisu",                 popularity_score: 35,  cm_per_prep_min: 32.50 },
  { item_name: "Sarson Ka Saag",           popularity_score: 32,  cm_per_prep_min: 5.63  },
  { item_name: "Bruschetta al Pomodoro",   popularity_score: 22,  cm_per_prep_min: 12.60 },
  { item_name: "Soup del Giorno",          popularity_score: 12,  cm_per_prep_min: 11.20 },
  { item_name: "Amritsari Fish Fry",       popularity_score: 10,  cm_per_prep_min: 11.38 },
];

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC INSIGHT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function hiddenGoldInsights(data: HiddenGoldDataPoint[]): string[] {
  const profitThreshold = 14;
  const popThreshold = 50;
  const hidden = data
    .filter(d => d.popularity_score < popThreshold && d.cm_per_prep_min >= profitThreshold)
    .sort((a, b) => b.cm_per_prep_min - a.cm_per_prep_min);
  const stars = data.filter(d => d.popularity_score >= popThreshold && d.cm_per_prep_min >= profitThreshold);
  const underperformers = data.filter(d => d.popularity_score < popThreshold && d.cm_per_prep_min < profitThreshold);
  const topHidden = hidden[0];
  return [
    hidden.length > 0
      ? `${hidden.map(h => h.item_name).join(", ")} ${hidden.length === 1 ? "is" : "are"} your Hidden Gold — highly profitable per minute of kitchen time but under-ordered. Push ${hidden.length === 1 ? "it" : "them"} in AI voice recommendations and combo suggestions.`
      : "No items currently qualify as Hidden Gold. All high-efficiency items are already popular.",
    topHidden
      ? `${topHidden.item_name} earns ₹${topHidden.cm_per_prep_min.toFixed(2)} per prep minute but has a popularity score of only ${topHidden.popularity_score}. Just 5 extra daily orders would unlock significant margin without adding kitchen strain.`
      : `Your most profitable items are already well-ordered — focus on protecting their availability.`,
    `${stars.length} items are Stars (popular + high profit/min): ${stars.map(s => s.item_name).join(", ")}. These are your revenue engines — never let them stock out during peak hours.`,
    underperformers.length > 0
      ? `${underperformers.length} items are Underperformers (low popularity + low margin/min): ${underperformers.map(u => u.item_name).join(", ")}. Consider bundling them into combos, repositioning on the menu, or replacing with higher-potential items.`
      : "No underperformers detected — every item is pulling its weight in at least one dimension.",
  ];
}

function sellingDayInsights(data: HighestSellingDayDataPoint[]): string[] {
  const sorted = [...data].sort((a, b) => b.revenue - a.revenue);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const total = data.reduce((s, d) => s + d.revenue, 0);
  const bestPct = Math.round((best.revenue / total) * 100);
  const upliftPotential = Math.round(best.revenue * 0.15);
  return [
    `${best.day_of_week} accounts for ${bestPct}% of weekly revenue (₹${best.revenue.toLocaleString("en-IN")}). Ensure full staffing and stocked inventory every ${best.day_of_week}.`,
    `${worst.day_of_week} is your quietest day at ₹${worst.revenue.toLocaleString("en-IN")}. A targeted ${worst.day_of_week} combo deal could recover ₹${Math.round(worst.revenue * 0.3).toLocaleString("en-IN")}+ in additional revenue.`,
    `Even a 15% uplift on your peak day (${best.day_of_week}) would add ₹${upliftPotential.toLocaleString("en-IN")} — achievable with proactive upsell scripts and dessert nudges.`,
  ];
}

function trendingInsights(data: TrendingItemDataPoint[]): string[] {
  const sorted = [...data].sort((a, b) => b.trend_score - a.trend_score);
  const top = sorted[0];
  const matchedMargin = demandMarginData.find(d => d.item_name === top.item_name);
  const topNames = sorted.map(d => d.item_name).join(", ");
  return [
    `${top.item_name} is gaining the fastest momentum (trend score ${top.trend_score}). Feature it first in your AI voice upsell flow to capitalise on growing demand.`,
    `All 5 trending items — ${topNames} — already have strong margins. Stock extra ingredients before peak hours to avoid running out mid-service.`,
    matchedMargin
      ? `If you push ${top.item_name} (₹${matchedMargin.cm_rupees} margin) through just 5 extra daily orders, that is ₹${(matchedMargin.cm_rupees * 5 * 30).toFixed(0)} in additional monthly margin.`
      : `Riding these trends with targeted upsells can significantly boost your monthly revenue.`,
  ];
}

function peakHoursInsights(data: PeakOrderHoursDataPoint[]): string[] {
  const peak = [...data].sort((a, b) => b.order_count - a.order_count)[0];
  const lunch = data.filter(h => h.hour >= 12 && h.hour <= 14).reduce((s, h) => s + h.order_count, 0);
  const dinner = data.filter(h => h.hour >= 17 && h.hour <= 23).reduce((s, h) => s + h.order_count, 0);
  const dinnerPct = Math.round((dinner / (lunch + dinner)) * 100);
  return [
    `Your absolute peak is ${String(peak.hour).padStart(2, "0")}:00 with ${peak.order_count} order lines. Pre-prepare all high-demand items at least 30 minutes before this hour.`,
    `Dinner (5pm-11pm) drives ${dinnerPct}% of order activity vs Lunch. Route your AI voice upsell push notifications and combo nudges primarily during the dinner window.`,
    `Quiet hours (2pm-5pm) can be used for mise en place and staff briefings. Consider a "Happy Hours" deal to drive traffic before the dinner rush begins.`,
  ];
}

function priceSignalInsights(data: PriceSignalDataPoint[]): string[] {
  const sorted = [...data].sort((a, b) => b.elasticity_index - a.elasticity_index);
  const raiseCandidates = sorted.slice(0, 2);
  const sensitive = sorted[sorted.length - 1];
  return [
    `${raiseCandidates[0].item_name} is the least price-sensitive item (index ${raiseCandidates[0].elasticity_index}). Raising its price by ₹15-20 would add margin with negligible drop in orders.`,
    `${sensitive.item_name} is your most price-sensitive item — customers notice every rupee change here. Keep its price stable; it is a volume anchor that drives larger orders.`,
    `${raiseCandidates.map(r => r.item_name).join(" and ")} together can absorb a small price increase. ₹10 added to each across the expected order volume could add ₹${raiseCandidates.length * 10 * 20}+ per month.`,
  ];
}

function dailyRevenueInsights(data: DailyRevenueDataPoint[]): string[] {
  const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const best = [...data].sort((a, b) => b.revenue - a.revenue)[0];
  const avg = Math.round(data.reduce((s, d) => s + d.revenue, 0) / data.length);
  const growthPct = Math.round(((last.revenue - first.revenue) / first.revenue) * 100);
  const dip = [...sorted].sort((a, b) => a.revenue - b.revenue)[0];
  return [
    `Revenue grew from ₹${first.revenue} (${first.date}) to ₹${last.revenue} (${last.date}) — a ${growthPct > 0 ? "+" : ""}${growthPct}% change over ${sorted.length} tracked order days.`,
    `Your best single-order day was ${best.date} at ₹${best.revenue}. Average per-order-day revenue is ₹${avg}. Aim to push every order day above this average.`,
    `The slowest day (${dip.date}, ₹${dip.revenue}) is ₹${avg - dip.revenue} below average. Investigate whether it was a staffing, inventory, or demand issue to prevent recurrence.`,
  ];
}

function itemContributionInsights(data: ItemContributionDataPoint[]): string[] {
  const sorted = [...data].sort((a, b) => b.revenue - a.revenue);
  const total = data.reduce((s, d) => s + d.revenue, 0);
  const top3 = sorted.slice(0, 3);
  const top3Total = top3.reduce((s, d) => s + d.revenue, 0);
  const top3Pct = Math.round((top3Total / total) * 100);
  const bottom = sorted[sorted.length - 1];
  return [
    `${top3.map(i => i.item_name).join(", ")} together make up ${top3Pct}% of all order revenue (₹${top3Total.toLocaleString("en-IN")} of ₹${total.toLocaleString("en-IN")}). A stockout of any of these during service directly costs you money.`,
    `${bottom.item_name} contributes the least at ₹${bottom.revenue}. Consider replacing it with a higher-margin alternative or bundling it into a combo to increase its attach rate.`,
    `Upselling Tiramisu and Gulab Jamun to every Butter Chicken order could add ₹${(162.5 + 105).toFixed(0)} of margin per converted ticket.`,
  ];
}

function popularityProfitabilityInsights(data: DemandMarginDataPoint[]): string[] {
  const highProfitLowPop = [...data]
    .filter(d => d.cm_rupees >= 250 && d.popularity_score <= 50)
    .sort((a, b) => b.cm_rupees - a.cm_rupees);
  const sweetSpot = [...data].sort(
    (a, b) => (b.popularity_score * b.cm_rupees) - (a.popularity_score * a.cm_rupees)
  )[0];
  const underRecognised = highProfitLowPop[0];
  return [
    `${sweetSpot.item_name} scores highest on the combined popularity x profitability index — it is your single most strategically valuable item. Protect its availability and use it as the anchor in your premium combos.`,
    underRecognised
      ? `${underRecognised.item_name} earns ₹${underRecognised.cm_rupees}/order but has a popularity score of only ${underRecognised.popularity_score}. Adding it to your AI voice upsell flow could generate ₹${(underRecognised.cm_rupees * 10).toFixed(0)}+ in additional margin from just 10 extra orders.`
      : `Several high-margin items are underordered. Push them via upsell combos to maximise revenue per table.`,
    `Items in the top-right quadrant (high popularity + high margin) are your Stars. Items in the bottom-right (high margin + low popularity) are Hidden Gems waiting to be unlocked through promotion and menu placement.`,
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART COMPONENTS (all inlined)
// ─────────────────────────────────────────────────────────────────────────────

function HiddenGoldChart({ data, height = "480px" }: { data: HiddenGoldDataPoint[]; height?: string }) {
  const popThreshold = 50;
  const profitThreshold = 14;
  const maxY = Math.ceil(Math.max(...data.map((d) => d.cm_per_prep_min)) / 5) * 5 + 2;

  const classify = (d: HiddenGoldDataPoint) => {
    const highPop = d.popularity_score >= popThreshold;
    const highProfit = d.cm_per_prep_min >= profitThreshold;
    if (!highPop && highProfit) return "gold";
    if (highPop && highProfit) return "star";
    if (highPop && !highProfit) return "crowd";
    return "underperformer";
  };

  const colors = { gold: "#e8930c", star: "#3ba272", crowd: "#5470c6", underperformer: "#d14a61" };
  const groups: Record<string, { label: string; color: string; items: HiddenGoldDataPoint[] }> = {
    gold:           { label: "Hidden Gold",     color: colors.gold, items: [] },
    star:           { label: "Star",            color: colors.star, items: [] },
    crowd:          { label: "Crowd Favorite",  color: colors.crowd, items: [] },
    underperformer: { label: "Underperformer",  color: colors.underperformer, items: [] },
  };
  data.forEach((d) => groups[classify(d)].items.push(d));

  const topGold = groups.gold.items.sort((a, b) => b.cm_per_prep_min - a.cm_per_prep_min)[0];
  const topStar = groups.star.items.sort((a, b) => b.cm_per_prep_min - a.cm_per_prep_min)[0];

  const buildSeries = (key: string) => {
    const g = groups[key];
    return {
      name: g.label,
      type: "scatter" as const,
      data: g.items.map((d) => ({ value: [d.popularity_score, d.cm_per_prep_min], itemName: d.item_name })),
      symbolSize: (val: number[]) => Math.max(14, Math.min(32, val[1] * 0.9)),
      itemStyle: { color: g.color, borderColor: "#fff", borderWidth: 2, shadowBlur: 6, shadowColor: "rgba(0,0,0,0.12)" },
      label: {
        show: true,
        formatter: (params: any) => {
          const name = params.data.itemName;
          if (topGold && name === topGold.item_name) return name;
          if (topStar && name === topStar.item_name) return name;
          return "";
        },
        position: "top" as const, fontSize: 11, fontWeight: 600 as const, color: "#333", distance: 8,
      },
      emphasis: {
        label: { show: true, formatter: (params: any) => params.data.itemName, position: "top" as const, fontSize: 12, fontWeight: 700 as const, color: "#111" },
        itemStyle: { borderWidth: 3, shadowBlur: 12, shadowColor: "rgba(0,0,0,0.25)" },
        scale: true,
      },
    };
  };

  const option = {
    title: { text: "Menu Hidden Gold Detector", left: "center", top: 6, textStyle: { fontSize: 16, fontWeight: 700, color: "#1a1a2e" } },
    legend: { show: false },
    tooltip: {
      trigger: "item",
      backgroundColor: "#fff", borderColor: "#e0e0e0", borderWidth: 1, textStyle: { color: "#333", fontSize: 13 },
      formatter: (params: any) => {
        const d = params.data;
        return [
          `<b style="font-size:14px">${d.itemName}</b>`,
          `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${params.color};margin-right:6px"></span>${params.seriesName}`,
          `Popularity Score: <b>${d.value[0]}</b>`,
          `Margin / Prep Min: <b>₹${(d.value[1] as number).toFixed(2)}</b>`,
        ].join("<br/>");
      },
    },
    xAxis: { name: "Popularity Score", nameLocation: "middle", nameGap: 28, nameTextStyle: { fontSize: 13, fontWeight: 600, color: "#555" }, type: "value", min: 0, max: 100, splitLine: { show: false }, axisLine: { lineStyle: { color: "#ccc" } }, axisTick: { show: false }, axisLabel: { color: "#777" } },
    yAxis: { name: "Margin per Prep Min (₹)", nameLocation: "middle", nameGap: 46, nameTextStyle: { fontSize: 13, fontWeight: 600, color: "#555" }, type: "value", min: 0, max: maxY, splitLine: { lineStyle: { type: "dashed", color: "#eee" } }, axisLine: { lineStyle: { color: "#ccc" } }, axisTick: { show: false }, axisLabel: { color: "#777" } },
    series: [
      {
        name: "_zones", type: "scatter", data: [], silent: true,
        markArea: {
          silent: true,
          data: [
            [{ xAxis: 0, yAxis: profitThreshold, itemStyle: { color: "rgba(232,147,12,0.08)" } }, { xAxis: popThreshold, yAxis: maxY }],
            [{ xAxis: popThreshold, yAxis: profitThreshold, itemStyle: { color: "rgba(59,162,114,0.08)" } }, { xAxis: 100, yAxis: maxY }],
            [{ xAxis: popThreshold, yAxis: 0, itemStyle: { color: "rgba(84,112,198,0.07)" } }, { xAxis: 100, yAxis: profitThreshold }],
            [{ xAxis: 0, yAxis: 0, itemStyle: { color: "rgba(209,74,97,0.06)" } }, { xAxis: popThreshold, yAxis: profitThreshold }],
          ] as any,
        },
        markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", width: 1.5, color: "#bbb" }, label: { show: false }, data: [{ xAxis: popThreshold }, { yAxis: profitThreshold }] },
      },
      buildSeries("gold"),
      buildSeries("star"),
      buildSeries("crowd"),
      buildSeries("underperformer"),
    ],
    graphic: [
      { type: "text", left: "12%", top: "14%", style: { text: "HIDDEN GOLD", fontSize: 11, fontWeight: 700, fill: "rgba(232,147,12,0.35)", letterSpacing: 1 } },
      { type: "text", right: "6%", top: "14%", style: { text: "STARS", fontSize: 11, fontWeight: 700, fill: "rgba(59,162,114,0.35)", letterSpacing: 1 } },
      { type: "text", right: "6%", bottom: "16%", style: { text: "CROWD FAVORITES", fontSize: 11, fontWeight: 700, fill: "rgba(84,112,198,0.3)", letterSpacing: 1 } },
      { type: "text", left: "12%", bottom: "16%", style: { text: "UNDERPERFORMERS", fontSize: 11, fontWeight: 700, fill: "rgba(209,74,97,0.28)", letterSpacing: 1 } },
    ],
    grid: { left: 64, right: 28, bottom: 48, top: 52 },
  };

  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
}

function HighestSellingDayChart({ data, height = "400px" }: { data: HighestSellingDayDataPoint[]; height?: string }) {
  const option = {
    title: { text: "Highest Selling Day of Week", left: "center" },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        return `<b>${p.name}</b><br/>Revenue: ₹${p.value.toLocaleString("en-IN")}`;
      },
    },
    xAxis: { type: "category", data: data.map((d) => d.day_of_week), axisLabel: { rotate: 0 } },
    yAxis: { type: "value", name: "Revenue (₹)", nameLocation: "middle", nameGap: 60, axisLabel: { formatter: (v: number) => `₹${(v / 1000).toFixed(0)}k` } },
    series: [{ type: "bar", data: data.map((d) => d.revenue), itemStyle: { color: "#91cc75", borderRadius: [4, 4, 0, 0] }, barMaxWidth: 50 }],
    grid: { left: 80, right: 20, bottom: 40, top: 50 },
  };
  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
}

function TrendingItemsChart({ data, height = "350px" }: { data: TrendingItemDataPoint[]; height?: string }) {
  const sorted = [...data].sort((a, b) => a.trend_score - b.trend_score);
  const option = {
    title: { text: "Trending Items (Top 5)", left: "center" },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (params: any) => { const p = Array.isArray(params) ? params[0] : params; return `<b>${p.name}</b><br/>Trend Score: ${p.value}`; },
    },
    xAxis: { type: "value", name: "Trend Score", nameLocation: "middle", nameGap: 30 },
    yAxis: { type: "category", data: sorted.map((d) => d.item_name), axisLabel: { width: 120, overflow: "truncate" } },
    series: [{ type: "bar", data: sorted.map((d) => d.trend_score), itemStyle: { color: "#fac858", borderRadius: [0, 4, 4, 0] }, barMaxWidth: 30 }],
    grid: { left: 140, right: 30, bottom: 50, top: 50 },
  };
  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
}

function PeakOrderHoursChart({ data, height = "400px" }: { data: PeakOrderHoursDataPoint[]; height?: string }) {
  const sorted = [...data].sort((a, b) => a.hour - b.hour);
  const option = {
    title: { text: "Peak Order Hours", left: "center" },
    tooltip: { trigger: "axis", formatter: (params: any) => { const p = Array.isArray(params) ? params[0] : params; return `<b>${p.name}:00</b><br/>Orders: ${p.value}`; } },
    xAxis: { type: "category", data: sorted.map((d) => String(d.hour).padStart(2, "0")), name: "Hour", nameLocation: "middle", nameGap: 30, boundaryGap: false },
    yAxis: { type: "value", name: "Order Count", nameLocation: "middle", nameGap: 45 },
    series: [{ type: "line", data: sorted.map((d) => d.order_count), smooth: true, areaStyle: { opacity: 0.15 }, lineStyle: { width: 3 }, itemStyle: { color: "#ee6666" }, symbol: "circle", symbolSize: 8 }],
    grid: { left: 60, right: 20, bottom: 50, top: 50 },
  };
  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
}

function PriceSignalChart({ data, height = "400px" }: { data: PriceSignalDataPoint[]; height?: string }) {
  const option = {
    title: { text: "Price Optimization Signal", left: "center" },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (params: any) => { const p = Array.isArray(params) ? params[0] : params; const label = p.value > 0 ? "Inelastic (can raise)" : "Elastic (price-sensitive)"; return `<b>${p.name}</b><br/>Elasticity: ${p.value}<br/>${label}`; },
    },
    xAxis: { type: "category", data: data.map((d) => d.item_name), axisLabel: { rotate: 30, overflow: "truncate", width: 80 } },
    yAxis: { type: "value", name: "Elasticity Index", nameLocation: "middle", nameGap: 45, axisLine: { show: true } },
    visualMap: { show: false, pieces: [{ max: 0, color: "#ee6666" }, { min: 0, color: "#91cc75" }] },
    series: [{ type: "bar", data: data.map((d) => d.elasticity_index), barMaxWidth: 40, itemStyle: { borderRadius: 3 }, markLine: { silent: true, data: [{ yAxis: 0 }], lineStyle: { color: "#333", type: "solid" }, label: { show: false }, symbol: "none" } }],
    grid: { left: 60, right: 20, bottom: 70, top: 50 },
  };
  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
}

function DailyRevenueChart({ data, height = "400px" }: { data: DailyRevenueDataPoint[]; height?: string }) {
  const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const option = {
    title: { text: "Daily Revenue Trend", left: "center" },
    tooltip: { trigger: "axis", formatter: (params: any) => { const p = Array.isArray(params) ? params[0] : params; return `<b>${p.name}</b><br/>Revenue: ₹${Number(p.value).toLocaleString("en-IN")}`; } },
    xAxis: { type: "category", data: sorted.map((d) => d.date), name: "Date", nameLocation: "middle", nameGap: 35, axisLabel: { rotate: 45 }, boundaryGap: false },
    yAxis: { type: "value", name: "Revenue (₹)", nameLocation: "middle", nameGap: 60, axisLabel: { formatter: (v: number) => `₹${(v / 1000).toFixed(0)}k` } },
    series: [{ type: "line", data: sorted.map((d) => d.revenue), smooth: true, areaStyle: { opacity: 0.2 }, lineStyle: { width: 3 }, itemStyle: { color: "#73c0de" }, symbol: "circle", symbolSize: 6 }],
    grid: { left: 80, right: 20, bottom: 70, top: 50 },
  };
  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
}

function ItemContributionChart({ data, height = "450px" }: { data: ItemContributionDataPoint[]; height?: string }) {
  const sorted = [...data].sort((a, b) => a.revenue - b.revenue);
  const option = {
    title: { text: "Item Revenue Contribution", left: "center" },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (params: any) => { const p = Array.isArray(params) ? params[0] : params; return `<b>${p.name}</b><br/>Revenue: ₹${Number(p.value).toLocaleString("en-IN")}`; } },
    xAxis: { type: "value", name: "Revenue (₹)", nameLocation: "middle", nameGap: 30, axisLabel: { formatter: (v: number) => `₹${(v / 1000).toFixed(0)}k` } },
    yAxis: { type: "category", data: sorted.map((d) => d.item_name), axisLabel: { width: 110, overflow: "truncate" } },
    series: [{ type: "bar", data: sorted.map((d) => d.revenue), itemStyle: { color: "#5470c6", borderRadius: [0, 4, 4, 0] }, barMaxWidth: 24 }],
    grid: { left: 130, right: 30, bottom: 50, top: 50 },
  };
  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
}

function PopularityProfitabilityChart({ data, height = "400px" }: { data: DemandMarginDataPoint[]; height?: string }) {
  const option = {
    title: { text: "Popularity vs Profitability", left: "center" },
    tooltip: { trigger: "item", formatter: (params: any) => { const d = data[params.dataIndex]; return `<b>${d.item_name}</b><br/>Popularity: ${d.popularity_score}<br/>Margin: ₹${d.cm_rupees}`; } },
    xAxis: { name: "Popularity Score", nameLocation: "middle", nameGap: 30, type: "value", min: 0, max: 100 },
    yAxis: { name: "Contribution Margin (₹)", nameLocation: "middle", nameGap: 50, type: "value" },
    series: [{ type: "scatter", symbolSize: 14, data: data.map((d) => [d.popularity_score, d.cm_rupees]), itemStyle: { color: "#fc8452" } }],
    grid: { left: 70, right: 30, bottom: 60, top: 50 },
  };
  return <ReactECharts option={option} style={{ height, width: "100%" }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART CARD WRAPPER
// ─────────────────────────────────────────────────────────────────────────────

function ChartCard({ children, whatItMeans, insights }: { children: React.ReactNode; whatItMeans: string; insights: string[] }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 16px 8px" }}>{children}</div>
      <div style={{ borderTop: "1px solid #f0f0f0", margin: "0 16px" }} />
      <div style={{ padding: "12px 16px 0" }}>
        <p style={{ margin: 0, fontSize: 13, color: "#555", lineHeight: 1.55 }}>
          <span style={{ fontWeight: 600, color: "#333" }}>What this tells you: </span>
          {whatItMeans}
        </p>
      </div>
      <div style={{ borderTop: "1px dashed #ebebeb", margin: "10px 16px 0" }} />
      <div style={{ padding: "10px 16px 16px" }}>
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#5470c6", textTransform: "uppercase", letterSpacing: "0.05em" }}>Revenue Insights</p>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {insights.map((insight, i) => (
            <li key={i} style={{ fontSize: 13, color: "#444", lineHeight: 1.55, background: "#f8f9ff", borderLeft: "3px solid #5470c6", borderRadius: "0 6px 6px 0", padding: "5px 10px" }}>
              {insight}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  return (
    <div style={{ padding: "24px", maxWidth: 1400, margin: "0 auto", background: "#f0f2f5", minHeight: "100vh" }}>
      <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#1a1a2e" }}>
            Tadka &amp; Twist — Revenue Intelligence Dashboard
          </h1>
          <p style={{ margin: "6px 0 0", color: "#888", fontSize: 14 }}>
            Every chart below includes plain-language insights to help you take action today.
          </p>
        </div>
        <a
          href="/revenue-copilot"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600, boxShadow: "0 2px 8px rgba(99,102,241,0.3)", whiteSpace: "nowrap" }}
        >
          <span style={{ fontSize: 16 }}>₹</span> Revenue Copilot
        </a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(560px, 1fr))", gap: 24 }}>
        <ChartCard
          whatItMeans="Finds menu items that are very profitable per minute of kitchen time but under-ordered. Items in the gold zone are Hidden Gold — push them in recommendations to unlock untapped margin without adding kitchen strain."
          insights={hiddenGoldInsights(hiddenGoldData)}
        >
          <HiddenGoldChart data={hiddenGoldData} />
        </ChartCard>

        <ChartCard
          whatItMeans="Compares revenue by day of the week so you can spot your busiest and quietest days and plan staffing, inventory, and promotions accordingly."
          insights={sellingDayInsights(highestSellingDayData)}
        >
          <HighestSellingDayChart data={highestSellingDayData} />
        </ChartCard>

        <ChartCard
          whatItMeans="Tracks which items have the highest upward momentum in orders right now. Trending items are your best bet for short-term upsell campaigns."
          insights={trendingInsights(trendingItemsData)}
        >
          <TrendingItemsChart data={trendingItemsData} />
        </ChartCard>

        <ChartCard
          whatItMeans="Shows when customers order the most. Knowing your peak hours lets you staff smartly, pre-prepare popular items, and schedule upsell scripts for maximum impact."
          insights={peakHoursInsights(peakOrderHoursData)}
        >
          <PeakOrderHoursChart data={peakOrderHoursData} />
        </ChartCard>

        <ChartCard
          whatItMeans="Measures how sensitive each item's demand is to a price change. High inelasticity means you can nudge the price up without losing orders — direct bottom-line improvement."
          insights={priceSignalInsights(priceSignalData)}
        >
          <PriceSignalChart data={priceSignalData} />
        </ChartCard>

        <ChartCard
          whatItMeans="Tracks your revenue order-by-order over time. Spot growth trends, revenue dips, and your all-time best days so you can replicate what worked."
          insights={dailyRevenueInsights(dailyRevenueData)}
        >
          <DailyRevenueChart data={dailyRevenueData} />
        </ChartCard>

        <ChartCard
          whatItMeans="Ranks every item by the total revenue it has generated. A handful of items typically drive the majority of income — this chart pinpoints exactly which ones."
          insights={itemContributionInsights(itemContributionData)}
        >
          <ItemContributionChart data={itemContributionData} />
        </ChartCard>

        <ChartCard
          whatItMeans="Plots each item on a Popularity vs Profitability grid so you can instantly see which items to push harder (high margin, low popularity) and which to protect (high on both)."
          insights={popularityProfitabilityInsights(demandMarginData)}
        >
          <PopularityProfitabilityChart data={demandMarginData} />
        </ChartCard>
      </div>
    </div>
  );
}
