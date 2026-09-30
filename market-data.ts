export type Direction = "LONG" | "SHORT";
export type Confidence = "VERY HIGH" | "HIGH" | "MEDIUM" | "LOW";
export type EntryType = "FVG" | "OB" | "OTE";
export type Killzone = "Asian" | "London" | "NY AM" | "NY PM" | "London Close";

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

export const KILLZONES = [
  { name: "Asian" as Killzone, window: "8:00 PM – 12:00 AM" },
  { name: "London" as Killzone, window: "2:00 AM – 5:00 AM" },
  { name: "NY AM" as Killzone, window: "7:00 AM – 10:00 AM" },
  { name: "NY PM" as Killzone, window: "1:30 PM – 4:00 PM" },
  { name: "London Close" as Killzone, window: "10:00 AM – 12:00 PM" },
];

export const SCORING = [
  ["CRT Expansion candle", 15],
  ["CRT Normal candle", 10],
  ["Sweep inside Killzone", 15],
  ["MSS confirmed", 15],
  ["FVG present", 10],
  ["Order Block present", 10],
  ["FVG/OB inside OTE", 5],
  ["HTF bias aligned", 15],
  ["RR ≥ 2.0", 5],
  ["Sweep depth ≥ 0.3× ATR", 5],
  ["Fresh FVG/OB", 5],
  ["Double sweep", 10],
  ["4H CRT confluence", 10],
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
  { name: "Classic CRT + ICT Long", detail: "SSL sweep in a Killzone, M15 MSS, entry in the bullish FVG.", bonus: "Core" },
  { name: "Classic CRT + ICT Short", detail: "BSL sweep in a Killzone, M15 MSS, entry in the bearish FVG.", bonus: "Core" },
  { name: "Order Block Entry", detail: "Entry at 50% of the order block instead of the gap.", bonus: "Core" },
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

export function confidenceOf(score: number): Confidence {
  if (score >= 90) return "VERY HIGH";
  if (score >= 75) return "HIGH";
  if (score >= 60) return "MEDIUM";
  return "LOW";
}
