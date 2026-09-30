# CRT + ICT Analyzer: Combined Source Files

Contents:
1. `backtest.functions.ts` (server-side backtest engine)
2. `market-data.ts` (types, constants, sample signals)
3. `backtester.tsx` (Backtester page route)

---

## 1. backtest.functions.ts

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { analyze, type Bar } from "@/lib/analysis";
import type { Killzone } from "@/lib/market-data";
import { INSTRUMENTS, MARKETS, klines, type Instrument, type Timeframe } from "@/lib/market.functions";

export type BacktestTrade = {
  id: string;
  pair: string;
  market: string;
  direction: "LONG" | "SHORT";
  killzone: Killzone | null;
  entryType: "FVG" | "OB";
  crtType: "Expansion" | "Normal" | "Consolidation";
  score: number;
  rr: number;
  entry: number;
  stop: number;
  target: number;
  decimals: number;
  openedAt: number;
  closedAt: number | null;
  result: "TP HIT" | "SL HIT" | "NO FILL" | "OPEN";
  r: number;
};

export type BacktestResult = {
  ranAt: number;
  timeframe: Timeframe;
  fromMs: number;
  toMs: number;
  pairsTested: number;
  setupsFound: number;
  trades: BacktestTrade[];
  closed: number;
  wins: number;
  losses: number;
  noFills: number;
  winRate: number;
  avgRR: number;
  profitFactor: number;
  totalR: number;
  maxDrawdownR: number;
  tradesPerMonth: number;
  equity: number[];
  byKillzone: { name: string; trades: number; win: number }[];
  bestKillzone: string;
  bestCandle: string;
};

/** History depth per intraday timeframe: how many days of walk-forward we can cover. */
const HISTORY: Record<Timeframe, { intradayLimit: number; dailyLimit: number }> = {
  M5: { intradayLimit: 1000, dailyLimit: 60 },
  M15: { intradayLimit: 1000, dailyLimit: 60 },
  H1: { intradayLimit: 1000, dailyLimit: 120 },
  H4: { intradayLimit: 500, dailyLimit: 180 },
};

const DAY = 24 * 3600 * 1000;

/** Walk a single instrument day by day, taking every setup the engine validates. */
function walk(inst: Instrument, tf: Timeframe, dailies: Bar[], intraday: Bar[]) {
  const trades: BacktestTrade[] = [];
  let setups = 0;

  for (let d = 25; d < dailies.length - 1; d++) {
    const crt = dailies[d]!;
    const sessionStart = crt.t + DAY;
    const session = intraday.filter((b) => b.t >= sessionStart && b.t < sessionStart + DAY);
    if (session.length < 20) continue;

    const a = analyze(dailies.slice(0, d + 2), session);
    if (!a.valid || a.entry === null || a.stop === null || a.target === null || a.mssIdx === null || !a.direction) {
      continue;
    }
    setups++;

    const dir = a.direction;
    const entry = a.entry;
    const stop = a.stop;
    const target = a.target;
    const forward = [
      ...session.slice(a.mssIdx + 1),
      // allow the trade to resolve into the following session
      ...intraday.filter((b) => b.t >= sessionStart + DAY && b.t < sessionStart + 2 * DAY),
    ];

    let filledAt: number | null = null;
    let result: BacktestTrade["result"] = "NO FILL";
    let closedAt: number | null = null;

    for (const b of forward) {
      if (filledAt === null) {
        if (b.low <= entry && b.high >= entry) {
          filledAt = b.t;
          result = "OPEN";
        } else {
          continue;
        }
      }
      const hitStop = dir === "LONG" ? b.low <= stop : b.high >= stop;
      const hitTarget = dir === "LONG" ? b.high >= target : b.low <= target;
      // Conservative: if both levels trade inside one bar, count the loss.
      if (hitStop) {
        result = "SL HIT";
        closedAt = b.t;
        break;
      }
      if (hitTarget) {
        result = "TP HIT";
        closedAt = b.t;
        break;
      }
    }

    trades.push({
      id: `${inst.pair}-${tf}-${sessionStart}`,
      pair: inst.pair,
      market: inst.market,
      direction: dir,
      killzone: a.sweepKillzone,
      entryType: a.fvgIdx !== null ? "FVG" : "OB",
      crtType: a.crtType,
      score: a.score,
      rr: a.rr,
      entry,
      stop,
      target,
      decimals: inst.decimals,
      openedAt: filledAt ?? sessionStart,
      closedAt,
      result,
      r: result === "TP HIT" ? a.rr : result === "SL HIT" ? -1 : 0,
    });
  }

  return { trades, setups };
}

export const runBacktest = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        timeframe: z.enum(["M5", "M15", "H1", "H4"]).default("M15"),
        markets: z.array(z.enum(MARKETS)).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<BacktestResult> => {
    const tf = data.timeframe as Timeframe;
    const cfg = HISTORY[tf];
    const wanted = data.markets && data.markets.length > 0 ? data.markets : MARKETS;
    const list = INSTRUMENTS.filter((i) => wanted.includes(i.market));

    const per = await Promise.all(
      list.map(async (inst) => {
        try {
          const [dailies, intraday] = await Promise.all([
            klines(inst, "D1", cfg.dailyLimit),
            klines(inst, tf, cfg.intradayLimit),
          ]);
          if (dailies.length < 30 || intraday.length < 100) return null;
          return { inst, ...walk(inst, tf, dailies, intraday) };
        } catch {
          return null;
        }
      }),
    );

    const ok = per.filter((p): p is NonNullable<typeof p> => p !== null);
    const trades = ok
      .flatMap((p) => p.trades)
      .sort((x, y) => y.openedAt - x.openedAt);
    const setupsFound = ok.reduce((s, p) => s + p.setups, 0);

    const closed = trades.filter((t) => t.result === "TP HIT" || t.result === "SL HIT");
    const wins = closed.filter((t) => t.result === "TP HIT");
    const losses = closed.filter((t) => t.result === "SL HIT");
    const grossWin = wins.reduce((s, t) => s + t.rr, 0);
    const grossLoss = losses.length;

    // Equity curve in R multiples, oldest trade first.
    const chrono = [...closed].sort((a, b) => a.openedAt - b.openedAt);
    const equity: number[] = [0];
    let run = 0;
    let peak = 0;
    let dd = 0;
    for (const t of chrono) {
      run += t.r;
      equity.push(run);
      peak = Math.max(peak, run);
      dd = Math.max(dd, peak - run);
    }

    const times = trades.map((t) => t.openedAt);
    const fromMs = times.length ? Math.min(...times) : Date.now();
    const toMs = times.length ? Math.max(...times) : Date.now();
    const months = Math.max((toMs - fromMs) / (30 * DAY), 0.25);

    const kzNames = ["London", "NY AM", "NY PM", "London Close", "Asian"];
    const byKillzone = kzNames
      .map((name) => {
        const rows = closed.filter((t) => t.killzone === name);
        const w = rows.filter((t) => t.result === "TP HIT").length;
        return { name, trades: rows.length, win: rows.length ? Math.round((w / rows.length) * 100) : 0 };
      })
      .filter((k) => k.trades > 0)
      .sort((a, b) => b.win - a.win || b.trades - a.trades);

    const candleStats = (["Expansion", "Normal"] as const).map((type) => {
      const rows = closed.filter((t) => t.crtType === type);
      const w = rows.filter((t) => t.result === "TP HIT").length;
      return { type, trades: rows.length, win: rows.length ? (w / rows.length) * 100 : 0 };
    });
    const bestCandleRow = [...candleStats].filter((c) => c.trades > 0).sort((a, b) => b.win - a.win)[0];

    return {
      ranAt: Date.now(),
      timeframe: tf,
      fromMs,
      toMs,
      pairsTested: ok.length,
      setupsFound,
      trades: trades.slice(0, 40),
      closed: closed.length,
      wins: wins.length,
      losses: losses.length,
      noFills: trades.filter((t) => t.result === "NO FILL").length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      avgRR: closed.length ? closed.reduce((s, t) => s + t.rr, 0) / closed.length : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      totalR: run,
      maxDrawdownR: dd,
      tradesPerMonth: closed.length / months,
      equity,
      byKillzone,
      bestKillzone: byKillzone[0]?.name ?? "—",
      bestCandle: bestCandleRow ? `${bestCandleRow.type} (${Math.round(bestCandleRow.win)}%)` : "—",
    };
  });
```

---

## 2. market-data.ts

```ts
export type Direction = "LONG" | "SHORT";
export type Confidence = "VERY HIGH" | "HIGH" | "MEDIUM" | "LOW";
export type EntryType = "FVG" | "OB" | "OTE";
export type Killzone = "Asian" | "London" | "NY AM" | "NY PM" | "London Close";

export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Signal = {
  id: string;
  pair: string;
  direction: Direction;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  rr: number;
  score: number;
  confidence: Confidence;
  killzone: Killzone;
  htfBias: "BULLISH" | "BEARISH";
  entryType: EntryType;
  crtType: "Expansion" | "Normal";
  timeframe: string;
  createdAt: string;
  status: "ACTIVE" | "TP HIT" | "SL HIT" | "EXPIRED";
  factors: string[];
};

export const KILLZONES: { name: Killzone; window: string }[] = [
  { name: "Asian", window: "8:00 PM – 12:00 AM" },
  { name: "London", window: "2:00 AM – 5:00 AM" },
  { name: "NY AM", window: "7:00 AM – 10:00 AM" },
  { name: "NY PM", window: "1:30 PM – 4:00 PM" },
  { name: "London Close", window: "10:00 AM – 12:00 PM" },
];

export const SCORING = [
  { factor: "CRT Expansion candle", points: 15 },
  { factor: "CRT Normal candle", points: 10 },
  { factor: "Sweep inside Killzone", points: 15 },
  { factor: "MSS confirmed", points: 15 },
  { factor: "FVG present", points: 10 },
  { factor: "Order Block present", points: 10 },
  { factor: "FVG/OB inside OTE", points: 5 },
  { factor: "HTF bias aligned", points: 15 },
  { factor: "RR ≥ 2.0", points: 5 },
  { factor: "Sweep depth ≥ 0.3× ATR", points: 5 },
  { factor: "Fresh FVG/OB", points: 5 },
  { factor: "Double sweep", points: 10 },
  { factor: "4H CRT confluence", points: 10 },
];

export const GLOSSARY = [
  ["CRT", "Candle Range Theory — a single higher-timeframe candle defines the dealing range."],
  ["ICT", "Inner Circle Trader — a methodology built around liquidity and timing."],
  ["BSL", "Buy-Side Liquidity — resting stops above the range high."],
  ["SSL", "Sell-Side Liquidity — resting stops below the range low."],
  ["Sweep", "Price breaks a level to trigger stops, then reverses back inside."],
  ["MSS", "Market Structure Shift — a break of the last opposing swing point."],
  ["FVG", "Fair Value Gap — a three-candle imbalance price tends to revisit."],
  ["OB", "Order Block — the last opposing candle before a displacement move."],
  ["OTE", "Optimal Trade Entry — the 62%–79% retracement of the displacement leg."],
  ["Killzone", "A time window of high institutional activity."],
  ["Confluence", "Multiple rules aligning on the same idea."],
  ["RR", "Risk-to-Reward — reward distance divided by risk distance."],
  ["HTF Bias", "Higher-timeframe directional lean, from Daily and H4."],
] as const;

export const DECISION_STEPS = [
  ["Load previous Daily candle", "Build the CRT range: High, Low, Mid and total range size."],
  ["Classify the CRT candle", "Expansion above 1.5× ATR, Normal 0.7–1.5×, Consolidation below 0.7× is skipped."],
  ["Determine HTF bias", "Read direction from the Daily and H4 structure."],
  ["Check the clock", "The setup must form inside a Killzone."],
  ["Detect the sweep", "A wick takes BSL or SSL, then closes back inside the range."],
  ["Validate the sweep", "Sweep depth must be at least 0.3× ATR and land in a Killzone."],
  ["Detect MSS", "On M15 or M5, price must break the last opposing swing with displacement."],
  ["Find the entry zone", "Locate the resulting FVG or Order Block."],
  ["Check OTE overlap", "Bonus confidence when the zone sits in the 62–79% retracement."],
  ["Calculate levels", "Entry at 50% of the zone, stop beyond the sweep, target the opposite CRT side."],
  ["Check risk-to-reward", "Below 2.0 the setup is discarded."],
  ["Score the confluence", "Below 60 points the setup is discarded."],
  ["News filter", "Skip anything within 30 minutes of high-impact news."],
  ["Emit the signal", "Publish the card, chart overlay and alerts."],
] as const;

export const INVALIDATIONS = [
  "CRT candle is a consolidation candle",
  "Sweep happened outside a Killzone",
  "No MSS within 20 candles of the sweep",
  "Risk-to-reward below 2.0",
  "Higher-timeframe bias points the other way",
  "High-impact news within 30 minutes",
  "MSS failed and price reclaimed the level",
];

export const PATTERNS = [
  { name: "Classic CRT + ICT Long", detail: "SSL sweep in a Killzone, M15 MSS, entry in the bullish FVG. Stop below the sweep low, target the CRT High.", bonus: "Core" },
  { name: "Classic CRT + ICT Short", detail: "BSL sweep in a Killzone, M15 MSS, entry in the bearish FVG. Stop above the sweep high, target the CRT Low.", bonus: "Core" },
  { name: "Order Block Entry", detail: "Same sequence as the classics but the entry sits at 50% of the order block instead of the gap.", bonus: "Core" },
  { name: "Double Sweep", detail: "Both sides of the range get taken; the second sweep is the real one.", bonus: "+10" },
  { name: "OTE-Refined", detail: "The FVG or order block falls inside the 62–79% retracement band.", bonus: "+5" },
  { name: "4H CRT Confluence", detail: "A 4H range nests inside the Daily range and points the same way.", bonus: "+10" },
  { name: "Failed MSS", detail: "Structure break gets reclaimed — the signal is invalidated, not traded.", bonus: "Invalid" },
];

export const signals: Signal[] = [
  {
    id: "sig-1041", pair: "GBPUSD", direction: "LONG", entry: 1.2693, stopLoss: 1.267, takeProfit: 1.275,
    rr: 2.48, score: 92, confidence: "VERY HIGH", killzone: "London", htfBias: "BULLISH", entryType: "FVG",
    crtType: "Expansion", timeframe: "M15", createdAt: "2026-09-10T07:12:00Z", status: "ACTIVE",
    factors: ["CRT Expansion", "Sweep in Killzone", "MSS confirmed", "FVG present", "HTF bias aligned", "FVG in OTE"],
  },
  {
    id: "sig-1040", pair: "XAUUSD", direction: "SHORT", entry: 2384.4, stopLoss: 2391.2, takeProfit: 2366.1,
    rr: 2.69, score: 84, confidence: "HIGH", killzone: "NY AM", htfBias: "BEARISH", entryType: "OB",
    crtType: "Expansion", timeframe: "M5", createdAt: "2026-09-10T05:40:00Z", status: "ACTIVE",
    factors: ["CRT Expansion", "Sweep in Killzone", "MSS confirmed", "OB present", "HTF bias aligned"],
  },
  {
    id: "sig-1039", pair: "EURUSD", direction: "LONG", entry: 1.0842, stopLoss: 1.0828, takeProfit: 1.0879,
    rr: 2.64, score: 78, confidence: "HIGH", killzone: "London", htfBias: "BULLISH", entryType: "FVG",
    crtType: "Normal", timeframe: "M15", createdAt: "2026-09-09T06:22:00Z", status: "TP HIT",
    factors: ["CRT Normal", "Sweep in Killzone", "MSS confirmed", "FVG present", "HTF bias aligned"],
  },
  {
    id: "sig-1038", pair: "BTCUSD", direction: "SHORT", entry: 63180, stopLoss: 63760, takeProfit: 61840,
    rr: 2.31, score: 71, confidence: "MEDIUM", killzone: "NY PM", htfBias: "BEARISH", entryType: "OTE",
    crtType: "Normal", timeframe: "M15", createdAt: "2026-09-09T13:55:00Z", status: "SL HIT",
    factors: ["CRT Normal", "Sweep in Killzone", "MSS confirmed", "FVG in OTE"],
  },
  {
    id: "sig-1037", pair: "US100", direction: "LONG", entry: 18422, stopLoss: 18376, takeProfit: 18545,
    rr: 2.67, score: 88, confidence: "HIGH", killzone: "NY AM", htfBias: "BULLISH", entryType: "OB",
    crtType: "Expansion", timeframe: "M5", createdAt: "2026-09-08T08:05:00Z", status: "TP HIT",
    factors: ["CRT Expansion", "Double sweep", "MSS confirmed", "OB present", "HTF bias aligned"],
  },
  {
    id: "sig-1036", pair: "USDJPY", direction: "SHORT", entry: 156.42, stopLoss: 156.78, takeProfit: 155.53,
    rr: 2.47, score: 64, confidence: "MEDIUM", killzone: "Asian", htfBias: "BEARISH", entryType: "FVG",
    crtType: "Normal", timeframe: "M15", createdAt: "2026-09-08T21:30:00Z", status: "EXPIRED",
    factors: ["CRT Normal", "Sweep in Killzone", "MSS confirmed", "FVG present"],
  },
  {
    id: "sig-1035", pair: "GBPJPY", direction: "LONG", entry: 198.34, stopLoss: 197.86, takeProfit: 199.62,
    rr: 2.67, score: 81, confidence: "HIGH", killzone: "London", htfBias: "BULLISH", entryType: "OB",
    crtType: "Expansion", timeframe: "M15", createdAt: "2026-09-05T03:18:00Z", status: "TP HIT",
    factors: ["CRT Expansion", "Sweep in Killzone", "MSS confirmed", "OB present", "4H CRT confluence"],
  },
  {
    id: "sig-1034", pair: "ETHUSD", direction: "LONG", entry: 2456.2, stopLoss: 2431.5, takeProfit: 2519.4,
    rr: 2.56, score: 76, confidence: "HIGH", killzone: "NY AM", htfBias: "BULLISH", entryType: "FVG",
    crtType: "Normal", timeframe: "M5", createdAt: "2026-09-04T12:44:00Z", status: "TP HIT",
    factors: ["CRT Normal", "Sweep in Killzone", "MSS confirmed", "FVG present", "Fresh FVG"],
  },
];

/** Deterministic pseudo-random candles used only for the illustrative strategy diagrams. */
export function buildCandles(seed: number, base: number, count = 72, vol = 0.0016): (Candle & { t: number })[] {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const out: (Candle & { t: number })[] = [];
  const t0 = Date.UTC(2026, 0, 5, 0, 0, 0);
  let price = base;
  for (let i = 0; i < count; i++) {
    const drift = (rnd() - 0.46) * base * vol;
    const open = price;
    const close = open + drift;
    const wick = base * vol * (0.4 + rnd() * 1.1);
    const high = Math.max(open, close) + wick * rnd();
    const low = Math.min(open, close) - wick * rnd();
    const hh = String(Math.floor(i / 4)).padStart(2, "0");
    const mm = String((i % 4) * 15).padStart(2, "0");
    out.push({ t: t0 + i * 15 * 60000, time: `${hh}:${mm}`, open, high, low, close });
    price = close;
  }
  return out;
}

export const WATCHLIST = [
  { pair: "GBPUSD", price: 1.2694, change: 0.32, seed: 7, base: 1.269, vol: 0.0016 },
  { pair: "EURUSD", price: 1.0846, change: -0.11, seed: 19, base: 1.084, vol: 0.0014 },
  { pair: "XAUUSD", price: 2382.6, change: -0.48, seed: 33, base: 2380, vol: 0.0022 },
  { pair: "USDJPY", price: 156.28, change: 0.19, seed: 51, base: 156.3, vol: 0.0015 },
  { pair: "US100", price: 18441, change: 0.74, seed: 66, base: 18400, vol: 0.002 },
  { pair: "BTCUSD", price: 63052, change: -1.24, seed: 88, base: 63000, vol: 0.004 },
];


export function confidenceOf(score: number): Confidence {
  if (score >= 90) return "VERY HIGH";
  if (score >= 75) return "HIGH";
  if (score >= 60) return "MEDIUM";
  return "LOW";
}
```

---

## 3. backtester.tsx

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { InfoTip } from "@/components/InfoTip";
import { runBacktest } from "@/lib/backtest.functions";
import { TIMEFRAMES, type Timeframe } from "@/lib/market.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/backtester")({
  head: () => ({
    meta: [
      { title: "Backtester — CRT + ICT Analyzer" },
      { name: "description", content: "Walk-forward test of the CRT + ICT rule set on real market history: win rate, average risk-to-reward, profit factor, drawdown and equity curve." },
      { property: "og:title", content: "Backtester — CRT + ICT Analyzer" },
      { property: "og:description", content: "Win rate, profit factor, drawdown and equity curve from real price history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BacktesterPage,
});

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

function BacktesterPage() {
  const [tf, setTf] = useState<Timeframe>("M15");
  const run = useServerFn(runBacktest);
  const { data, isFetching, isError } = useQuery({
    queryKey: ["backtest", tf],
    queryFn: () => run({ data: { timeframe: tf } }),
    staleTime: 10 * 60_000,
  });

  const eq = data?.equity ?? [];
  const lo = eq.length ? Math.min(0, ...eq) : 0;
  const hi = eq.length ? Math.max(1, ...eq) : 1;
  const pts =
    eq.length > 1
      ? eq.map((v, i) => `${(i / (eq.length - 1)) * 100},${40 - ((v - lo) / (hi - lo)) * 36}`).join(" ")
      : "";

  const subtitle = data
    ? `${fmtDate(data.fromMs)} – ${fmtDate(data.toMs)} · ${data.pairsTested} pairs · every setup the engine validated on real ${data.timeframe} candles.`
    : "Replaying the rules over real market history…";

  return (
    <AppShell title="Backtester" subtitle={subtitle}>
      <div className="panel mb-4 flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-xs text-muted-foreground">Entry timeframe</span>
        <div className="flex gap-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={cn(
                "num rounded-md px-2.5 py-1.5 text-xs transition-colors",
                t === tf ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-surface-2",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="num ml-auto text-xs text-muted-foreground">
          {isFetching ? "replaying history…" : data ? `${data.closed} closed trades · ${data.noFills} never filled` : ""}
        </span>
      </div>

      {isError && (
        <div className="panel p-4 text-sm text-bear">Could not load price history for the test. Try again in a moment.</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Win rate" value={data ? `${data.winRate.toFixed(1)}%` : "—"} tip="Share of filled trades that reached target before stop." />
        <Metric label="Average R:R" value={data ? data.avgRR.toFixed(2) : "—"} tip="Average reward per unit of risk across the trades taken." />
        <Metric
          label="Profit factor"
          value={data ? (Number.isFinite(data.profitFactor) ? data.profitFactor.toFixed(2) : "∞") : "—"}
          tip="Gross profit divided by gross loss. Above 1.5 is healthy."
        />
        <Metric label="Max drawdown" value={data ? `${data.maxDrawdownR.toFixed(1)}R` : "—"} tip="Largest peak-to-trough fall of the curve, in risk multiples." tone="text-bear" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_320px]">
        <section className="panel p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Equity curve</h2>
            <InfoTip text="Cumulative result in R multiples, one point per closed trade. A win adds its risk-to-reward, a loss subtracts 1." />
          </div>
          <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="mt-4 h-56 w-full" role="img" aria-label="Equity curve across the tested period">
            <defs>
              <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3].map((i) => (
              <line key={i} x1="0" x2="100" y1={4 + i * 12} y2={4 + i * 12} stroke="var(--grid)" strokeWidth="0.3" />
            ))}
            {pts && <polygon points={`0,40 ${pts} 100,40`} fill="url(#eq)" />}
            {pts && <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />}
          </svg>
          <p className="num mt-2 text-xs text-muted-foreground">
            {data
              ? `${data.closed} closed trades · ${data.tradesPerMonth.toFixed(1)} per month · closing at ${data.totalR >= 0 ? "+" : ""}${data.totalR.toFixed(1)}R`
              : "loading…"}
          </p>
        </section>

        <section className="panel p-4">
          <h2 className="text-sm font-semibold">Performance by killzone</h2>
          <ul className="mt-4 space-y-3">
            {(data?.byKillzone ?? []).map((k) => (
              <li key={k.name}>
                <div className="flex justify-between text-xs">
                  <span>{k.name}</span>
                  <span className="num text-muted-foreground">{k.win}% · {k.trades} trades</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className={cn("h-full rounded-full", k.win >= 60 ? "bg-bull" : k.win >= 50 ? "bg-accent" : "bg-bear")} style={{ width: `${k.win}%` }} />
                </div>
              </li>
            ))}
            {data && data.byKillzone.length === 0 && (
              <li className="text-xs text-muted-foreground">No closed trades in the tested window.</li>
            )}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
            <div className="flex justify-between"><dt className="text-muted-foreground">Best killzone</dt><dd className="num">{data?.bestKillzone ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Best candle type</dt><dd className="num">{data?.bestCandle ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Setups detected</dt><dd className="num">{data?.setupsFound ?? "—"}</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel mt-4 overflow-x-auto">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Trades taken</h2>
        <table className="w-full min-w-[820px] text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              {["Date", "Pair", "Direction", "Killzone", "Entry type", "Score", "R:R", "Result"].map((h) => (
                <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.trades ?? []).map((t) => (
              <tr key={t.id} className="border-b border-border/60">
                <td className="num px-4 py-2 text-muted-foreground">{fmtDate(t.openedAt)}</td>
                <td className="px-4 py-2 font-medium">{t.pair}</td>
                <td className={cn("px-4 py-2", t.direction === "LONG" ? "text-bull" : "text-bear")}>{t.direction}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.killzone ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.entryType}</td>
                <td className="num px-4 py-2">{t.score}</td>
                <td className="num px-4 py-2">{t.rr.toFixed(2)}</td>
                <td className={cn("px-4 py-2 font-medium", t.result === "TP HIT" ? "text-bull" : t.result === "SL HIT" ? "text-bear" : "text-muted-foreground")}>{t.result}</td>
              </tr>
            ))}
            {data && data.trades.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-4 text-muted-foreground">No setup passed every rule in the tested window.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="mt-3 text-xs text-muted-foreground">
        Results come from replaying the rules on real candles, entry only when price traded back into the zone, and a bar
        that touches both stop and target is counted as a loss. Spread, slippage and commission are not modelled.
      </p>
    </AppShell>
  );
}

function Metric({ label, value, tip, tone }: { label: string; value: string; tip: string; tone?: string }) {
  return (
    <div className="panel p-4">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label} <InfoTip text={tip} />
      </p>
      <p className={cn("num mt-1 text-2xl font-semibold", tone)}>{value}</p>
    </div>
  );
}
```
