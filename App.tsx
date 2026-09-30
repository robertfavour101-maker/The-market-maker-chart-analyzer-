import { useMemo, useState } from "react";
import { DECISION_STEPS, INVALIDATIONS, PATTERNS, SCORING, signals, type Signal } from "./data/market-data";

function App() {
  const [pair, setPair] = useState("ALL");
  const [timeframe, setTimeframe] = useState("M15");
  const [tab, setTab] = useState<"signals" | "rules" | "backtest">("signals");

  const filtered = useMemo(
    () => signals.filter(s => (pair === "ALL" || s.pair === pair) && (timeframe === "ALL" || s.timeframe === timeframe)),
    [pair, timeframe]
  );

  const active = signals.filter(s => s.status === "ACTIVE").length;
  const closed = signals.filter(s => s.status === "TP HIT" || s.status === "SL HIT");
  const wins = closed.filter(s => s.status === "TP HIT").length;
  const winRate = closed.length ? Math.round((wins / closed.length) * 100) : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="eyebrow">CRT + ICT ANALYZER</div>
          <h1>Forex AI Analyzer</h1>
          <p className="muted">Rebuild v1 · recovered project logic and sample signals</p>
        </div>
        <div className="status"><span className="dot" /> DEMO / SAFE MODE</div>
      </header>

      <div className="notice">
        <strong>IMPORTANT:</strong> This rebuild currently uses the signals preserved in your recovered file.
        It does <strong>not</strong> connect to Deriv or execute trades. The missing live analysis engine will be added only after we recover/rebuild it.
      </div>

      <nav className="tabs">
        {(["signals", "rules", "backtest"] as const).map(t =>
          <button className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)} key={t}>
            {t === "signals" ? "Signals" : t === "rules" ? "Strategy Rules" : "Backtester"}
          </button>
        )}
      </nav>

      {tab === "signals" && (
        <>
          <section className="controls card">
            <label>PAIR
              <select value={pair} onChange={e => setPair(e.target.value)}>
                <option value="ALL">All pairs</option>
                {[...new Set(signals.map(s => s.pair))].map(p => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label>TIMEFRAME
              <select value={timeframe} onChange={e => setTimeframe(e.target.value)}>
                <option value="ALL">All timeframes</option>
                <option>M5</option><option>M15</option><option>H1</option><option>H4</option>
              </select>
            </label>
            <button className="primary" onClick={() => alert("Live analysis is not connected yet. This button will be connected to the recovered analyzer engine in the next build.")}>
              ANALYZE
            </button>
          </section>

          <section className="metrics">
            <Metric title="Active signals" value={String(active)} />
            <Metric title="Closed sample" value={String(closed.length)} />
            <Metric title="Sample win rate" value={`${winRate}%`} />
            <Metric title="Average R:R" value={(signals.reduce((a,s) => a + s.rr, 0) / signals.length).toFixed(2)} />
          </section>

          <section className="grid">
            {filtered.map(s => <SignalCard key={s.id} signal={s} />)}
          </section>

          <section className="card">
            <h2>Decision pipeline preserved from your project</h2>
            <div className="steps">
              {DECISION_STEPS.map(([title, detail], i) =>
                <div className="step" key={title}><span>{i + 1}</span><div><strong>{title}</strong><p>{detail}</p></div></div>
              )}
            </div>
          </section>
        </>
      )}

      {tab === "rules" && (
        <div className="two-col">
          <section className="card">
            <h2>Confluence scoring</h2>
            {SCORING.map(([name, points]) => <div className="score-row" key={name}><span>{name}</span><b>+{points}</b></div>)}
          </section>
          <section className="card">
            <h2>Invalidations</h2>
            {INVALIDATIONS.map(x => <div className="invalid" key={x}>× {x}</div>)}
            <h2 className="mt">Patterns</h2>
            {PATTERNS.map(p => <div className="pattern" key={p.name}><strong>{p.name}</strong><span>{p.bonus}</span><p>{p.detail}</p></div>)}
          </section>
        </div>
      )}

      {tab === "backtest" && (
        <section className="card">
          <h2>Backtester</h2>
          <p className="muted">The recovered backtester expects missing modules such as <code>lib/analysis</code> and <code>lib/market.functions</code>. We will rebuild those before enabling historical tests.</p>
          <div className="locked">BACKTEST ENGINE: WAITING FOR ANALYSIS MODULE RECOVERY</div>
          <p className="small">The original source specifies M5, M15, H1 and H4, walk-forward testing, win rate, average R:R, profit factor, max drawdown, equity curve and killzone statistics.</p>
        </section>
      )}
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="metric card"><span>{title}</span><b>{value}</b></div>;
}

function SignalCard({ signal }: { signal: Signal }) {
  return (
    <article className="card signal">
      <div className="signal-head">
        <div><strong>{signal.pair}</strong><span>{signal.timeframe} · {signal.killzone}</span></div>
        <span className={signal.direction === "LONG" ? "badge bull" : "badge bear"}>{signal.direction}</span>
      </div>
      <div className="level-grid">
        <div><span>ENTRY</span><b>{signal.entry}</b></div>
        <div><span>STOP LOSS</span><b>{signal.stopLoss}</b></div>
        <div><span>TAKE PROFIT</span><b>{signal.takeProfit}</b></div>
        <div><span>R:R</span><b>{signal.rr.toFixed(2)}</b></div>
      </div>
      <div className="signal-meta">
        <span>Score <b>{signal.score}</b></span>
        <span>{signal.confidence}</span>
        <span>{signal.entryType}</span>
        <span>{signal.htfBias}</span>
      </div>
      <div className="factors">{signal.factors.map(f => <span key={f}>{f}</span>)}</div>
      <div className="signal-status">{signal.status}</div>
    </article>
  );
}

export default App;
