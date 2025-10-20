"use client";

import { useRef, useState } from "react";

/* ---------- Types ---------- */
type Coin = {
  name: string;
  symbol?: string;
  address?: string;
  marketCap?: number | string;
  volume24h?: number | string;
  uniqueHolders?: number | string;
  marketCapDelta24h?: number;
  change24h?: number;
  createdAt?: number | string;
};

type SwapUI = {
  side?: "BUY" | "SELL";
  amount?: number | string;
  address?: string;
  ts?: number | string;
  date?: string;
  time?: string;
};

type CommentUI = {
  user?: string;
  text?: string;
  ts?: number | string;
};

type HolderRow = {
  rank?: number;
  holder: string;
  balance: string | number;
  percentage?: number;
  isTopHolder?: boolean;
  ens?: string;
  owner?: string;
};

type HoldersPayload = HolderRow[] | { top10: HolderRow[] } | null | undefined;

type DetailsBlock = {
  swaps?: SwapUI[];
  comments?: CommentUI[];
  holders?: HoldersPayload;
};

type SpinResp = {
  ok: boolean;
  coin?: Coin;
  details?: DetailsBlock;
  stats?: {
    totalActivity: number;
    buyCount: number;
    sellCount: number;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    timestamp: number;
  };
  error?: string;
};

type LogLevel = "ok" | "warn" | "info";
type LogLine = { t: string; type: LogLevel };

/* ---------- Helpers ---------- */
function compact(n?: number | string) {
  const x = typeof n === "string" ? Number(n) : n;
  if (x == null || Number.isNaN(x)) return "—";
  const a = Math.abs(x);
  if (a >= 1e12) return (x / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return (x / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (x / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (x / 1e3).toFixed(2) + "K";
  return x.toFixed(2).replace(/\.00$/, "");
}
function pct(v?: number) {
  if (v == null || Number.isNaN(v)) return "N/A";
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}
function timeAgo(ts: number) {
  const d = Math.max(0, Date.now() - ts);
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const mon = Math.floor(days / 30);
  if (mon < 12) return `${mon}mo ago`;
  const yrs = Math.floor(mon / 12);
  return `${yrs}y ago`;
}
function shortAddr(a?: string) {
  if (!a) return "—";
  if (a.includes(".")) return a;
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
function nowHHMMSS() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}
function holdersArray(h: HoldersPayload): HolderRow[] {
  if (!h) return [];
  return Array.isArray(h) ? h : (h.top10 ?? []);
}
function toNumber(v?: number | string): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = Number(String(v).replaceAll(",", ""));
  return Number.isFinite(n) ? n : undefined;
}

/* ---------- Component ---------- */
export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SpinResp | null>(null);
  const [spins, setSpins] = useState<number>(0);
  const [history, setHistory] = useState<string[]>([]); // Track spun coins

  const [verbose, setVerbose] = useState<boolean>(true);
  const [log, setLog] = useState<LogLine[]>([
    { t: "💫 Live terminal ready. Press SPIN.", type: "info" },
  ]);
  const [toast, setToast] = useState<string | null>(null);

  const wheelRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<HTMLDivElement | null>(null);

  function pushLog(line: LogLine) {
    setLog((prev) => {
      const next = [...prev, line].slice(-400);
      requestAnimationFrame(() => {
        if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
      });
      return next;
    });
  }

  async function spin() {
    if (loading) return;
    try {
      setLoading(true);
      wheelRef.current?.classList.add("spinning");
      pushLog({ t: `[${nowHHMMSS()}] 🎰 Spinning…`, type: "info" });

      const r = await fetch("/api/spin", { cache: "no-store" });
      const j: SpinResp = await r.json();

      if (!j.ok) {
        pushLog({ t: `[${nowHHMMSS()}] ⚠ spin failed: ${j.error ?? "unexpected-error"}`, type: "warn" });
        setData(j);
        return;
      }

      setData(j);
      setSpins((s) => s + 1);

      const c = j.coin!;

      // Check if coin was already spun
      const isDuplicate = history.includes(c.address || '');
      if (c.address) {
        setHistory(prev => [...prev.slice(-19), c.address!]); // Keep last 20
      }

      const createdDate =
        c.createdAt != null
          ? new Date(typeof c.createdAt === "number" ? c.createdAt : Date.parse(String(c.createdAt)))
          : null;

      // Fun sentiment emoji
      const sentimentEmoji = j.stats?.sentiment === 'bullish' ? '🚀' :
        j.stats?.sentiment === 'bearish' ? '📉' : '😐';

      pushLog({
        t: `✔ ${sentimentEmoji} ${c.name}${c.symbol ? ` (${c.symbol})` : ""} — cap:${compact(c.marketCap)} vol24h:${compact(c.volume24h)} holders:${compact(c.uniqueHolders)}${isDuplicate ? ' 🔁' : ''}`,
        type: "ok",
      });

      if (verbose) {
        if (c.address) {
          pushLog({ t: `↳ address: ${shortAddr(c.address)} • link: https://zora.co/coin/${c.address}`, type: "info" });
        }
        if (createdDate) {
          pushLog({
            t: `↳ created: ${createdDate.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })} • ${timeAgo(createdDate.getTime())}`,
            type: "info",
          });
        }

        // Stats from API
        if (j.stats) {
          const { buyCount, sellCount, sentiment, totalActivity } = j.stats;
          pushLog({
            t: `↳ sentiment: ${sentiment} ${sentimentEmoji} • activity: ${totalActivity} • buys: ${buyCount} / sells: ${sellCount}`,
            type: "info"
          });
        }

        const d = j.details;
        if (d?.swaps && Array.isArray(d.swaps)) {
          const swaps = d.swaps as SwapUI[];
          pushLog({ t: `↳ recent swaps: ${swaps.length}`, type: "info" });
        }

        if (isDuplicate) {
          pushLog({ t: `↳ 🔁 You've seen this coin before!`, type: "warn" });
        }
      }

      // Fun toast messages
      if (isDuplicate) {
        setToast("🔁 Déjà vu! Seen this one before");
        setTimeout(() => setToast(null), 2000);
      } else if (j.stats?.sentiment === 'bullish' && j.stats.buyCount >= 7) {
        setToast("🚀 Bulls are running!");
        setTimeout(() => setToast(null), 2000);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushLog({ t: `[${nowHHMMSS()}] ⚠ spin failed: ${msg}`, type: "warn" });
    } finally {
      setLoading(false);
      setTimeout(() => wheelRef.current?.classList.remove("spinning"), 350);
    }
  }

  async function share() {
    const c = data?.coin;
    if (!c?.address) {
      setToast("No coin to share.");
      setTimeout(() => setToast(null), 1200);
      return;
    }
    const url = `https://zora.co/coin/${c.address}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast("Link copied!");
      pushLog({ t: `🔗 Copied: ${url}`, type: "info" });
    } catch {
      window.alert(url);
      setToast("Link ready!");
      pushLog({ t: `🔗 Link: ${url}`, type: "info" });
    }
    setTimeout(() => setToast(null), 1500);
  }

  const c = data?.coin ?? null;
  const createdDate =
    c?.createdAt != null
      ? new Date(typeof c.createdAt === "number" ? c.createdAt : Date.parse(String(c.createdAt)))
      : null;

  // Swaps data from API (already processed)
  const swapsTop10: SwapUI[] = Array.isArray(data?.details?.swaps)
    ? (data.details.swaps as SwapUI[]).slice(0, 10)
    : [];

  const holdersTop10: HolderRow[] = holdersArray(data?.details?.holders).slice(0, 10);

  // If API already provided percentages, use them
  const hasApiPercentages = holdersTop10.length > 0 && holdersTop10[0]?.percentage != null;

  // Calculate percentages if not provided by API
  const holdersTotal = hasApiPercentages ? 0 : holdersTop10.reduce((acc, h) => {
    const n = toNumber(h.balance);
    return acc + (n ?? 0);
  }, 0);

  const holdersPercentages = hasApiPercentages
    ? holdersTop10.map(h => h.percentage ?? 0)
    : holdersTop10.map((h) => {
      const n = toNumber(h.balance) ?? 0;
      const p = holdersTotal > 0 ? (n / holdersTotal) * 100 : 0;
      return Math.max(0, Math.min(100, p));
    });

  return (
    <main className="screen">
      {/* Header */}
      <header className="header">
        <h1 className="title">
          <span className="emoji">🎰</span> Zora Roulette — Web
        </h1>
        <p className="subtitle">Live coin picker with Zora GraphQL • not financial advice</p>
      </header>

      {/* Roulette */}
      <section className="roulette">
        <div ref={wheelRef} className="wheel">
          <div className="ring" />
          <div className="center">
            <div className="center-copy">
              <div className="mode">Mode</div>
              <div className="mode-value">Volume</div>
              <div className="spins">spins: {spins}</div>
            </div>
          </div>
          <div className="pointer" />
        </div>
      </section>

      {/* Actions */}
      <section className="toolbar">
        <div className="actions">
          <button onClick={spin} disabled={loading} className={`btn ${loading ? "busy" : ""}`}>
            {loading ? "Spinning..." : "Spin"}
          </button>
          <button onClick={share} className="btn secondary" disabled={!c}>
            Share
          </button>
        </div>

        <div className="toggles">
          <label className="toggle">
            <input
              type="checkbox"
              checked={verbose}
              onChange={(e) => setVerbose(e.target.checked)}
            />
            <span>Verbose log</span>
          </label>
          <button
            className="btn ghost"
            onClick={() => setLog([{ t: "🧹 Log cleared.", type: "info" }])}
          >
            Clear log
          </button>
        </div>
      </section>

      {/* Error */}
      {data && !data.ok && (
        <div className="error">Error: {data.error}</div>
      )}

      {/* Coin Card */}
      {c && (
        <section className="card">
          <div className="card-row">
            <div>
              <div className="coin-name">
                {c.name} {c.symbol ? <span className="symbol">({c.symbol})</span> : null}
                {data?.stats && (
                  <span className={`sentiment-badge ${data.stats.sentiment}`}>
                    {data.stats.sentiment === 'bullish' ? '🚀 Bullish' :
                      data.stats.sentiment === 'bearish' ? '📉 Bearish' :
                        '😐 Neutral'}
                  </span>
                )}
              </div>
              <div className="address">{c.address ? `0x${c.address.replace(/^0x/, "")}` : ""}</div>
            </div>
            <a
              href={c.address ? `https://zora.co/coin/${c.address}` : "https://zora.co/coins"}
              target="_blank"
              rel="noreferrer"
              className="link"
            >
              View on Zora →
            </a>
          </div>

          <div className="grid">
            <div className="metric">
              <div className="label">Market Cap</div>
              <div className="value cyan">{compact(c.marketCap)}</div>
            </div>
            <div className="metric">
              <div className="label">24h Volume</div>
              <div className="value pink">{compact(c.volume24h)}</div>
            </div>
            <div className="metric">
              <div className="label">Holders</div>
              <div className="value yellow">{compact(c.uniqueHolders)}</div>
            </div>
            <div className="metric">
              <div className="label">24h Cap Δ</div>
              <div
                className={`value ${Number(c.marketCapDelta24h ?? c.change24h) > 0 ? "green" : "red"}`}
              >
                {pct(Number(c.marketCapDelta24h ?? c.change24h))}
              </div>
            </div>
          </div>

          {createdDate && (
            <div className="created">
              Created:{" "}
              {createdDate.toLocaleDateString("en-US", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
              {" • "}
              {timeAgo(createdDate.getTime())}
            </div>
          )}

          {data?.stats && (
            <div className="activity-stats">
              <span>📊 Activity: {data.stats.totalActivity}</span>
              <span>↑ Buys: {data.stats.buyCount}</span>
              <span>↓ Sells: {data.stats.sellCount}</span>
            </div>
          )}
        </section>
      )}

      {/* Swaps Top 10 */}
      {swapsTop10.length > 0 && (
        <section className="panel">
          <div className="panel-head">Recent Swaps — Top 10</div>
          <div className="table">
            <div className="row head">
              <div className="cell idx">#</div>
              <div className="cell side">SIDE</div>
              <div className="cell amt">AMOUNT</div>
              <div className="cell addr">ADDRESS</div>
              <div className="cell date">DATE</div>
              <div className="cell time">TIME</div>
            </div>
            {swapsTop10.map((s, i) => {
              const side = (s.side ?? "BUY") === "BUY" ? "BUY" : "SELL";
              const sideClass = side === "BUY" ? "buy" : "sell";
              return (
                <div className="row" key={`swap-${i}`}>
                  <div className="cell idx">{i + 1}.</div>
                  <div className={`cell side tag ${sideClass}`}>
                    {side === "BUY" ? "▲ BUY" : "▼ SELL"}
                  </div>
                  <div className="cell amt">{compact(s.amount)}</div>
                  <div className="cell addr">{s.address || "—"}</div>
                  <div className="cell date">{s.date || "—"}</div>
                  <div className="cell time">{s.time || "—"}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Holders Top 10 – Simplified Visualization */}
      {holdersTop10.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            👑 Top 10 Holders
          </div>
          <div className="bars">
            {holdersTop10.map((h, i) => {
              const label = shortAddr(h.ens ?? h.holder ?? h.owner);
              const p = holdersPercentages[i] ?? 0;
              const bal = compact(toNumber(h.balance));
              const isTop = h.isTopHolder || i === 0;
              return (
                <div className={`bar-row ${isTop ? 'top-holder' : ''}`} key={`h-${i}`}>
                  <div className="bar-label">
                    <span className="rank">{h.rank ?? (i + 1)}.</span>
                    {isTop && <span className="crown">👑</span>}
                    <span className="addr">{label}</span>
                  </div>
                  <div className="bar-track" aria-label={`${label} ${p.toFixed(1)}%`}>
                    <div
                      className="bar-fill"
                      style={{ width: `${p}%` }}
                      data-percentage={p.toFixed(1)}
                    />
                    <div className="bar-stats">
                      <span className="bar-balance">{bal}</span>
                      <span className="bar-percentage">{p.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="panel-foot">
            💡 Distribution based on top 10 holders only
          </div>
        </section>
      )}

      {/* Terminal Log */}
      <section className="terminal" aria-label="Live log">
        <div className="term-head">Terminal</div>
        <div className="term-body" ref={termRef}>
          {log.map((l, i) => (
            <div className={`line ${l.type}`} key={`${l.type}-${i}`}>{l.t}</div>
          ))}
        </div>
      </section>

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}

      <footer className="foot">Casino vibes only — have fun.</footer>

      {/* --- styles: styled-jsx global (reset/theme) --- */}
      <style jsx global>{`
        :root {
          --bg1: #050b12;
          --bg2: #0b1f2e;
          --text: #e6f0ff;
          --dim: #9fb2c5;
          --panel: rgba(255,255,255,0.06);
          --panel-brd: rgba(255,255,255,0.12);
          --glow: rgba(34,211,238,0.28);
          --buy: #34d399;
          --sell: #f87171;
        }
        * { box-sizing: border-box; }
        html, body { height: 100%; }
        body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Inter, Roboto, Arial; color: var(--text); }
      `}</style>

      {/* --- styles: page --- */}
      <style jsx>{`
        .screen {
          min-height: 100vh;
          background:
            radial-gradient(1200px 600px at 50% -10%, var(--bg2) 0%, var(--bg1) 45%, #000 100%),
            radial-gradient(600px 300px at 85% 10%, rgba(34,211,238,0.12), transparent 70%),
            radial-gradient(600px 300px at 15% 15%, rgba(168,85,247,0.12), transparent 70%);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 32px 20px 40px;
        }

        .header { text-align: center; margin-top: 8px; }
        .title {
          font-size: 28px;
          font-weight: 900;
          letter-spacing: .4px;
          background: linear-gradient(90deg, #22d3ee, #a855f7);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 6px 30px rgba(34,211,238,0.25));
        }
        .emoji { margin-right: 6px; }
        .subtitle { margin-top: 6px; font-size: 12px; color: var(--dim); }

        .roulette { margin-top: 28px; }
        .wheel {
          position: relative;
          width: 260px; height: 260px;
          perspective: 900px;
          transform-style: preserve-3d;
          transition: transform 0.3s ease;
          filter: drop-shadow(0 10px 40px rgba(34,211,238,0.18));
        }
        .wheel.spinning { animation: spin 1.15s cubic-bezier(0.22,1,0.36,1); }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(720deg); }
        }

        .ring {
          position: absolute; inset: 0;
          border-radius: 9999px;
          background: conic-gradient(
            from 0deg,
            #10b981 0 18deg, #ef4444 18deg 36deg, #3b82f6 36deg 54deg, #f59e0b 54deg 72deg, #22d3ee 72deg 90deg,
            #a855f7 90deg 108deg, #e11d48 108deg 126deg, #22c55e 126deg 144deg, #06b6d4 144deg 162deg, #84cc16 162deg 180deg,
            #ef4444 180deg 198deg, #10b981 198deg 216deg, #3b82f6 216deg 234deg, #f59e0b 234deg 252deg, #a855f7 252deg 270deg,
            #22d3ee 270deg 288deg, #e11d48 288deg 306deg, #06b6d4 306deg 324deg, #84cc16 324deg 342deg, #22c55e 342deg 360deg
          );
          box-shadow: inset 0 0 30px rgba(0,0,0,0.35), 0 0 40px rgba(34,211,238,0.18);
        }
        .center {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .center::before {
          content: "";
          width: 140px; height: 140px;
          border-radius: 9999px;
          background: rgba(0,0,0,0.6);
          border: 1px solid var(--panel-brd);
          box-shadow: 0 10px 40px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.03);
          backdrop-filter: blur(6px);
          position: absolute;
        }
        .center-copy { position: relative; text-align: center; z-index: 2; }
        .mode { font-size: 12px; color: var(--dim); }
        .mode-value { margin-top: 4px; font-weight: 800; filter: drop-shadow(0 0 18px rgba(34,211,238,0.35)); }
        .spins { margin-top: 8px; font-size: 12px; color: var(--dim); }

        .pointer {
          position: absolute;
          top: -10px; left: 50%;
          transform: translateX(-50%);
          width: 0; height: 0;
          border-left: 10px solid transparent;
          border-right: 10px solid transparent;
          border-bottom: 14px solid #22d3ee;
          filter: drop-shadow(0 0 8px rgba(34,211,238,0.7));
        }

        .toolbar {
          margin-top: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 18px;
          flex-wrap: wrap;
        }
        .actions { display: flex; gap: 10px; }
        .toggles { display: flex; gap: 10px; align-items: center; }
        .toggle { display: inline-flex; gap: 8px; align-items: center; font-size: 12px; color: var(--dim); }

        .btn {
          appearance: none;
          border: 0;
          padding: 12px 18px;
          border-radius: 14px;
          color: #001510;
          font-weight: 800;
          background: linear-gradient(180deg, #34d399, #10b981);
          box-shadow:
            0 12px 30px rgba(16,185,129,0.35),
            0 0 0 1px rgba(255,255,255,0.08) inset,
            0 1px 0 rgba(255,255,255,0.18) inset;
          cursor: pointer;
          transition: transform .15s ease, box-shadow .15s ease, filter .15s ease, opacity .15s ease;
        }
        .btn:hover { transform: translateY(-1px); filter: saturate(1.1); }
        .btn:active { transform: translateY(1px) scale(0.99); }
        .btn.busy { opacity: .7; cursor: not-allowed; }

        .btn.secondary {
          background: linear-gradient(180deg, #93c5fd, #60a5fa);
          color: #001225;
          box-shadow:
            0 12px 30px rgba(59,130,246,0.35),
            0 0 0 1px rgba(255,255,255,0.08) inset,
            0 1px 0 rgba(255,255,255,0.18) inset;
        }
        .btn.ghost {
          background: rgba(255,255,255,0.06);
          color: var(--text);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
        }

        .error {
          margin-top: 16px;
          color: #fecaca;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.25);
          padding: 10px 12px;
          border-radius: 12px;
          font-size: 14px;
          max-width: 680px;
          width: calc(100% - 32px);
          text-align: center;
        }

        .card {
          margin-top: 28px;
          width: 100%;
          max-width: 900px;
          border-radius: 16px;
          border: 1px solid var(--panel-brd);
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03));
          backdrop-filter: blur(8px);
          padding: 16px;
          position: relative;
        }
        .card::after {
          content: "";
          position: absolute; inset: -1px;
          border-radius: 16px;
          box-shadow: 0 0 34px var(--glow);
          pointer-events: none;
          opacity: .35;
        }
        .card-row {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .coin-name { 
          font-size: 18px; 
          font-weight: 800; 
          letter-spacing: .2px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .symbol { color: #a9c7ff; font-weight: 700; }
        .sentiment-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .sentiment-badge.bullish {
          background: rgba(34,197,94,0.15);
          color: #86efac;
          border: 1px solid rgba(34,197,94,0.3);
        }
        .sentiment-badge.bearish {
          background: rgba(239,68,68,0.15);
          color: #fca5a5;
          border: 1px solid rgba(239,68,68,0.3);
        }
        .sentiment-badge.neutral {
          background: rgba(148,163,184,0.15);
          color: #cbd5e1;
          border: 1px solid rgba(148,163,184,0.3);
        }
        .address { margin-top: 4px; font-size: 12px; color: var(--dim); word-break: break-all; }
        .link { font-size: 12px; color: #89e6ff; text-decoration: underline; }

        .activity-stats {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.08);
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: var(--dim);
          flex-wrap: wrap;
        }
        .activity-stats span {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .grid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0,1fr));
          gap: 12px;
        }
        @media (max-width: 760px) {
          .grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
        }
        @media (max-width: 420px) {
          .grid { grid-template-columns: 1fr; }
        }
        .metric {
          border-radius: 14px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          padding: 10px 12px;
        }
        .label { font-size: 12px; color: var(--dim); }
        .value { margin-top: 6px; font-weight: 800; }
        .value.cyan { color: #99f6ff; }
        .value.pink { color: #ffc2f1; }
        .value.yellow { color: #ffe39b; }
        .value.green { color: #a7f3d0; }
        .value.red { color: #fca5a5; }

        .created { margin-top: 10px; font-size: 12px; color: var(--dim); }

        /* Panel (Swaps / Holders) */
        .panel {
          margin-top: 22px;
          width: 100%;
          max-width: 900px;
          border: 1px solid var(--panel-brd);
          border-radius: 12px;
          background: rgba(2,6,15,0.5);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
          overflow: hidden;
        }
        .panel-head {
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 700;
          color: #cbe7ff;
          background: rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .panel-foot {
          padding: 10px 12px;
          font-size: 12px;
          color: var(--dim);
          border-top: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.03);
        }

        /* Swaps Table */
        .table { width: 100%; }
        .row {
          display: grid;
          grid-template-columns: 44px 100px 1fr 140px 120px 80px;
          gap: 8px;
          padding: 8px 12px;
          align-items: center;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .row:last-child { border-bottom: 0; }
        .row.head {
          background: rgba(255,255,255,0.04);
          font-size: 12px;
          color: var(--dim);
          font-weight: 700;
        }
        .cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cell.idx { color: var(--dim); }
        .cell.side { font-weight: 800; letter-spacing: .3px; }
        .tag {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 6px 10px; border-radius: 10px;
          width: 90px;
          color: #001510;
        }
        .buy { background: var(--buy); }
        .sell { background: var(--sell); color: #240000; }
        .amt, .addr { font-weight: 700; }
        .addr { font-size: 11px; font-family: ui-monospace, monospace; }

        @media (max-width: 760px) {
          .row { grid-template-columns: 32px 84px 1fr 110px 100px 70px; }
        }
        @media (max-width: 520px) {
          .row { grid-template-columns: 28px 84px 1fr 100px; }
          .cell.date, .cell.time { display: none; }
        }

        /* Holders Bars - Simplified & Clear Colors */
        .bars { padding: 12px; display: flex; flex-direction: column; gap: 14px; }
        .bar-row { 
          display: grid; 
          grid-template-columns: 180px 1fr; 
          gap: 12px; 
          align-items: center;
          padding: 6px;
          border-radius: 8px;
          transition: all 0.2s ease;
        }
        .bar-row:hover { 
          background: rgba(34,211,238,0.08);
          transform: translateX(2px);
        }
        .bar-row.top-holder {
          background: rgba(250,204,21,0.1);
          border-left: 3px solid #fbbf24;
          padding-left: 9px;
        }
        .bar-row.top-holder:hover {
          background: rgba(250,204,21,0.15);
        }
        .bar-label { 
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px; 
          font-weight: 600;
          overflow: hidden;
        }
        .rank { 
          color: #64748b; 
          min-width: 18px;
          font-weight: 700;
        }
        .bar-row.top-holder .rank { color: #fbbf24; }
        .crown { font-size: 16px; filter: drop-shadow(0 0 4px rgba(251,191,36,0.6)); }
        .addr { 
          color: #cbd5e1;
          overflow: hidden; 
          text-overflow: ellipsis; 
          white-space: nowrap; 
        }
        .bar-row.top-holder .addr { color: #fef3c7; }
        .bar-track {
          position: relative;
          height: 36px;
          border-radius: 8px;
          background: rgba(15,23,42,0.6);
          border: 1px solid rgba(148,163,184,0.2);
          overflow: visible;
        }
        .bar-fill {
          position: absolute; 
          left: 0; 
          top: 0; 
          bottom: 0;
          background: linear-gradient(90deg, #06b6d4 0%, #0891b2 100%);
          border-radius: 7px;
          box-shadow: 
            0 0 20px rgba(6,182,212,0.3) inset,
            0 2px 8px rgba(6,182,212,0.4);
          transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .bar-row.top-holder .bar-fill {
          background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%);
          box-shadow: 
            0 0 20px rgba(251,191,36,0.4) inset,
            0 2px 8px rgba(251,191,36,0.5);
        }
        .bar-stats {
          position: absolute; 
          right: 10px; 
          top: 50%; 
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          z-index: 2;
        }
        .bar-balance {
          color: #94a3b8;
          font-weight: 600;
          background: rgba(15,23,42,0.8);
          padding: 2px 6px;
          border-radius: 4px;
        }
        .bar-percentage {
          color: #f0f9ff; 
          font-weight: 800;
          font-size: 14px;
          text-shadow: 
            0 1px 3px rgba(0,0,0,0.8),
            0 0 10px rgba(6,182,212,0.5);
        }
        .bar-row.top-holder .bar-percentage {
          text-shadow: 
            0 1px 3px rgba(0,0,0,0.8),
            0 0 10px rgba(251,191,36,0.6);
        }
        @media (max-width: 640px) {
          .bar-row { grid-template-columns: 140px 1fr; }
          .bar-balance { display: none; }
          .bar-stats { right: 6px; }
        }

        /* Terminal */
        .terminal {
          margin-top: 24px;
          width: 100%;
          max-width: 900px;
          border: 1px solid var(--panel-brd);
          border-radius: 12px;
          background: rgba(2,6,15,0.6);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
          overflow: hidden;
        }
        .term-head {
          padding: 10px 12px;
          font-size: 12px;
          color: var(--dim);
          background: rgba(255,255,255,0.04);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .term-body {
          max-height: 240px;
          overflow: auto;
          padding: 10px 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 12px;
          line-height: 1.45;
        }
        .line { padding: 2px 0; }
        .line.ok { color: #b1f0c9; }
        .line.warn { color: #fca5a5; }
        .line.info { color: #9fb2c5; }

        .toast {
          position: fixed;
          bottom: 16px;
          right: 16px;
          background: rgba(0,0,0,0.75);
          color: #e6f0ff;
          padding: 10px 12px;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 10px;
          font-size: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
          animation: toast-in .18s ease;
        }
        @keyframes toast-in {
          from { transform: translateY(6px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .foot { margin-top: 18px; font-size: 12px; color: var(--dim); }
      `}</style>
    </main>
  );
}