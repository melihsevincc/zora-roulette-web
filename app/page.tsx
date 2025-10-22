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
    poolSize?: number;
    freshCoins?: number;
    cacheSize?: number;
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
type Mode = 'volume' | 'trending' | 'new';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SpinResp | null>(null);
  const [spins, setSpins] = useState<number>(0);
  const [history, setHistory] = useState<string[]>([]);
  const [uniqueStreak, setUniqueStreak] = useState<number>(0);
  const [bestStreak, setBestStreak] = useState<number>(0);
  const [mode, setMode] = useState<Mode>('volume');
  const [previousCoin, setPreviousCoin] = useState<Coin | null>(null); // Track spun coins

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

      const r = await fetch(`/api/spin?mode=${mode}`, { cache: "no-store" });
      const j: SpinResp = await r.json();

      if (!j.ok) {
        pushLog({ t: `[${nowHHMMSS()}] ⚠ spin failed: ${j.error ?? "unexpected-error"}`, type: "warn" });
        setData(j);
        return;
      }

      if (data?.coin) {
        setPreviousCoin(data.coin);
      }
      setData(j);
      setSpins((s) => s + 1);

      const c = j.coin!;

      // Check if coin was already spun
      const isDuplicate = history.includes(c.address || '');
      if (c.address) {
        setHistory(prev => [...prev.slice(-19), c.address!]); // Keep last 20
        if (isDuplicate) {
          setUniqueStreak(0);
        } else {
          setUniqueStreak(prev => {
            const newStreak = prev + 1;
            if (newStreak > bestStreak) {
              setBestStreak(newStreak);
            }
            return newStreak;
          });
        }
      }

      const createdDate =
        c.createdAt != null
          ? new Date(typeof c.createdAt === "number" ? c.createdAt : Date.parse(String(c.createdAt)))
          : null;

      // Fun sentiment emoji
      const sentimentEmoji = j.stats?.sentiment === 'bullish' ? '🚀' :
        j.stats?.sentiment === 'bearish' ? '📉' : '😐';

      // Rarity detection
      const holders = toNumber(c.uniqueHolders) ?? 0;
      const isRare = holders > 0 && holders < 50;
      const isPopular = holders >= 1000;
      const rarityBadge = isRare ? '💎' : isPopular ? '🔥' : '';

      pushLog({
        t: `✔ ${sentimentEmoji} ${rarityBadge} ${c.name}${c.symbol ? ` (${c.symbol})` : ""} — cap:${compact(c.marketCap)} vol24h:${compact(c.volume24h)} holders:${compact(c.uniqueHolders)}${isDuplicate ? ' 🔁' : ''}`,
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

        // Stats from server
        if (j.stats?.poolSize) {
          pushLog({
            t: `↳ pool: ${j.stats.poolSize} • fresh: ${j.stats.freshCoins} • cache: ${j.stats.cacheSize}`,
            type: "info"
          });
        }

        // Rarity info
        if (isRare) {
          pushLog({ t: `↳ 💎 RARE GEM! Only ${holders} holders`, type: "ok" });
        } else if (isPopular) {
          pushLog({ t: `↳ 🔥 POPULAR! ${compact(holders)} holders`, type: "ok" });
        }

        // Streak info
        if (uniqueStreak >= 5) {
          pushLog({ t: `↳ 🔥 ${uniqueStreak} UNIQUE STREAK!`, type: "ok" });
        }
      }

      // Fun toast messages
      if (isDuplicate) {
        setToast("🔁 Déjà vu! Seen this one before");
        setTimeout(() => setToast(null), 2500);
      } else if (isRare) {
        setToast(`💎 Rare gem found! Only ${holders} holders`);
        setTimeout(() => setToast(null), 3000);
      } else if (uniqueStreak > 0 && uniqueStreak % 5 === 0) {
        setToast(`🔥 ${uniqueStreak} UNIQUE STREAK!`);
        setTimeout(() => setToast(null), 3000);
      } else if (j.stats?.sentiment === 'bullish' && j.stats.buyCount >= 7) {
        setToast("🚀 Bulls are running!");
        setTimeout(() => setToast(null), 2500);
      } else if (isPopular) {
        setToast(`🔥 Popular coin! ${compact(holders)} holders`);
        setTimeout(() => setToast(null), 2500);
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

    const holders = toNumber(c.uniqueHolders) ?? 0;
    const isRare = holders > 0 && holders < 50;
    const isPopular = holders >= 1000;
    const rarityText = isRare ? '💎 Rare Gem!' : isPopular ? '🔥 Popular!' : '';

    const sentimentEmoji = data?.stats?.sentiment === 'bullish' ? '🚀' :
      data?.stats?.sentiment === 'bearish' ? '📉' : '😐';

    const shareText = `🎰 Zora Roulette Spin #${spins}

${sentimentEmoji} ${c.name} ${c.symbol ? `($${c.symbol})` : ''}
${rarityText}

💰 Market Cap: ${compact(c.marketCap)}
📊 24h Volume: ${compact(c.volume24h)}
👥 Holders: ${compact(c.uniqueHolders)}
${uniqueStreak > 0 ? `🔥 Streak: ${uniqueStreak}\n` : ''}
🔗 https://zora.co/coin/${c.address}

Try it yourself: Zora Roulette`;

    try {
      await navigator.clipboard.writeText(shareText);
      setToast("📋 Share text copied!");
      pushLog({ t: `📋 Copied share text`, type: "info" });
    } catch {
      window.alert(shareText);
      setToast("Share text ready!");
      pushLog({ t: `📋 Share text ready`, type: "info" });
    }
    setTimeout(() => setToast(null), 2000);
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
              <div className="mode-label">Mode</div>
              <div className="mode-value">
                {mode === 'volume' && '📊 Volume'}
                {mode === 'trending' && '🔥 Trending'}
                {mode === 'new' && '✨ New'}
              </div>
              <div className="spins">spins: {spins}</div>
              {uniqueStreak >= 5 && (
                <div className="streak">🔥 {uniqueStreak}</div>
              )}
            </div>
          </div>
          <div className="pointer" />
        </div>
      </section>

      {/* Stats Bar */}
      {(uniqueStreak > 0 || bestStreak > 0 || spins > 0) && (
        <section className="stats-bar">
          <div className="stat-item">
            <span className="stat-label">Total Spins</span>
            <span className="stat-value">{spins}</span>
          </div>
          <div className="stat-item highlight">
            <span className="stat-label">Current Streak</span>
            <span className="stat-value">{uniqueStreak} {uniqueStreak >= 5 ? '🔥' : ''}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Best Streak</span>
            <span className="stat-value">{bestStreak} {bestStreak >= 10 ? '🏆' : ''}</span>
          </div>
        </section>
      )}

      {/* Mode Selector */}
      <section className="mode-selector">
        <button
          onClick={() => setMode('volume')}
          className={`mode-btn ${mode === 'volume' ? 'active' : ''}`}
          disabled={loading}
        >
          📊 Volume
        </button>
        <button
          onClick={() => setMode('trending')}
          className={`mode-btn ${mode === 'trending' ? 'active' : ''}`}
          disabled={loading}
        >
          🔥 Trending
        </button>
        <button
          onClick={() => setMode('new')}
          className={`mode-btn ${mode === 'new' ? 'active' : ''}`}
          disabled={loading}
        >
          ✨ New
        </button>
      </section>

      {/* Actions */}
      <section className="toolbar">
        <div className="actions">
          <button onClick={spin} disabled={loading} className={`btn primary ${loading ? "busy" : ""}`}>
            {loading ? "🎰 Spinning..." : "🎲 Spin the Wheel"}
          </button>
          <button onClick={share} className="btn secondary" disabled={!c}>
            📤 Share
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
          <button
            className="btn ghost"
            onClick={() => {
              setUniqueStreak(0);
              setBestStreak(0);
              setSpins(0);
              setHistory([]);
              setData(null);
              setLog([{ t: "🔄 Stats reset. Ready for a new session!", type: "info" }]);
            }}
          >
            Reset Stats
          </button>
        </div>
      </section>

      {/* Error */}
      {data && !data.ok && (
        <div className="error">Error: {data.error}</div>
      )}

      {/* Comparison */}
      {c && previousCoin && (
        <section className="comparison">
          <div className="comparison-title">📊 vs Previous Spin</div>
          <div className="comparison-grid">
            <div className="comparison-item">
              <span className="comparison-label">Market Cap</span>
              <span className={`comparison-value ${(toNumber(c.marketCap) ?? 0) > (toNumber(previousCoin.marketCap) ?? 0) ? 'up' : 'down'}`}>
                {(toNumber(c.marketCap) ?? 0) > (toNumber(previousCoin.marketCap) ?? 0) ? '📈 Higher' : '📉 Lower'}
              </span>
            </div>
            <div className="comparison-item">
              <span className="comparison-label">Volume</span>
              <span className={`comparison-value ${(toNumber(c.volume24h) ?? 0) > (toNumber(previousCoin.volume24h) ?? 0) ? 'up' : 'down'}`}>
                {(toNumber(c.volume24h) ?? 0) > (toNumber(previousCoin.volume24h) ?? 0) ? '📈 Higher' : '📉 Lower'}
              </span>
            </div>
            <div className="comparison-item">
              <span className="comparison-label">Holders</span>
              <span className={`comparison-value ${(toNumber(c.uniqueHolders) ?? 0) > (toNumber(previousCoin.uniqueHolders) ?? 0) ? 'up' : 'down'}`}>
                {(toNumber(c.uniqueHolders) ?? 0) > (toNumber(previousCoin.uniqueHolders) ?? 0) ? '📈 More' : '📉 Less'}
              </span>
            </div>
          </div>
        </section>
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
                {(() => {
                  const holders = toNumber(c.uniqueHolders) ?? 0;
                  if (holders > 0 && holders < 50) {
                    return <span className="rarity-badge rare">💎 Rare</span>;
                  }
                  if (holders >= 1000) {
                    return <span className="rarity-badge popular">🔥 Popular</span>;
                  }
                  return null;
                })()}
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
              {data.stats.poolSize && (
                <>
                  <span>🎰 Pool: {data.stats.poolSize}</span>
                  <span>✨ Fresh: {data.stats.freshCoins}</span>
                </>
              )}
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

      <footer className="foot">
        <div>Casino vibes only — have fun. Made for <a href="https://zora.co" target="_blank" rel="noreferrer" className="zora-link">zora.co</a></div>
        {uniqueStreak > 0 && (
          <div className="footer-stats">
            🎯 Current Streak: {uniqueStreak} unique {uniqueStreak === 1 ? 'coin' : 'coins'}
            {uniqueStreak >= 10 && ' 🏆'}
            {uniqueStreak >= 20 && ' 🔥🔥🔥'}
          </div>
        )}
      </footer>

      {/* --- styles: styled-jsx global (reset/theme) --- */}
      <style jsx global>{`
        :root {
          --bg1: #000000;
          --bg2: #0a0a0a;
          --text: #ffffff;
          --dim: #a1a1aa;
          --panel: rgba(255,255,255,0.03);
          --panel-brd: rgba(255,255,255,0.08);
          --glow: rgba(255,255,255,0.05);
          --buy: #10b981;
          --sell: #ef4444;
          --accent: #ffffff;
          --accent-dim: #71717a;
        }
        * { box-sizing: border-box; }
        html, body { height: 100%; }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
          color: var(--text);
          background: var(--bg1);
        }
      `}</style>

      {/* --- styles: page --- */}
      <style jsx>{`
        .screen {
          min-height: 100vh;
          background: #000000;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 20px;
        }

        .header { text-align: center; margin-bottom: 24px; }
        .title {
          font-size: 32px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #ffffff;
          margin: 0;
        }
        .emoji { margin-right: 8px; }
        .subtitle {
          margin-top: 8px;
          font-size: 14px;
          color: var(--dim);
          font-weight: 400;
        }

        .roulette { margin: 32px 0; }
        .wheel {
          position: relative;
          width: 320px;
          height: 320px;
          perspective: 1000px;
          transform-style: preserve-3d;
          transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .wheel.spinning {
          animation: spin 1.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes spin {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(360deg) scale(1.05); }
          100% { transform: rotate(720deg) scale(1); }
        }

        .ring {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background:
            conic-gradient(
              from 0deg,
              #ffffff 0deg 20deg,
              #e5e5e5 20deg 40deg,
              #d4d4d4 40deg 60deg,
              #a3a3a3 60deg 80deg,
              #737373 80deg 100deg,
              #525252 100deg 120deg,
              #404040 120deg 140deg,
              #262626 140deg 160deg,
              #171717 160deg 180deg,
              #ffffff 180deg 200deg,
              #e5e5e5 200deg 220deg,
              #d4d4d4 220deg 240deg,
              #a3a3a3 240deg 260deg,
              #737373 260deg 280deg,
              #525252 280deg 300deg,
              #404040 300deg 320deg,
              #262626 320deg 340deg,
              #171717 340deg 360deg
            );
          border: 2px solid #ffffff;
          box-shadow:
            inset 0 0 40px rgba(0, 0, 0, 0.5),
            0 0 60px rgba(255, 255, 255, 0.1),
            0 8px 32px rgba(0, 0, 0, 0.4);
        }
        .center {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .center::before {
          content: "";
          width: 180px;
          height: 180px;
          border-radius: 9999px;
          background: #000000;
          border: 3px solid #ffffff;
          box-shadow:
            0 0 0 8px rgba(255, 255, 255, 0.1),
            0 8px 32px rgba(0, 0, 0, 0.6),
            inset 0 2px 8px rgba(255, 255, 255, 0.1);
          position: absolute;
        }
        .center-copy { position: relative; text-align: center; z-index: 2; }
        .mode-label { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
        .mode-value { margin-top: 6px; font-weight: 700; font-size: 16px; color: #ffffff; }
        .spins { margin-top: 10px; font-size: 13px; color: var(--dim); font-weight: 500; }
        .streak {
          margin-top: 6px;
          font-size: 16px;
          font-weight: 900;
          color: #fbbf24;
          filter: drop-shadow(0 0 12px rgba(251,191,36,0.6));
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.9; }
        }

        .pointer {
          position: absolute;
          top: -16px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 14px solid transparent;
          border-right: 14px solid transparent;
          border-bottom: 20px solid #ffffff;
          filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
        }

        .mode-selector {
          margin: 24px 0 16px;
          display: flex;
          gap: 8px;
          padding: 4px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
        }
        .mode-btn {
          appearance: none;
          border: 0;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          background: transparent;
          color: var(--dim);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .mode-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.08);
          color: var(--text);
        }
        .mode-btn.active {
          background: #ffffff;
          color: #000000;
        }
        .mode-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .stats-bar {
          margin-top: 20px;
          display: flex;
          gap: 12px;
          padding: 12px 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
        }
        .stat-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: center;
          padding: 6px 12px;
          border-radius: 8px;
          background: rgba(0,0,0,0.2);
          min-width: 90px;
        }
        .stat-item.highlight {
          background: rgba(251,191,36,0.15);
          border: 1px solid rgba(251,191,36,0.3);
        }
        .stat-label {
          font-size: 10px;
          color: var(--dim);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }
        .stat-value {
          font-size: 18px;
          font-weight: 900;
          color: var(--text);
        }
        .stat-item.highlight .stat-value {
          color: #fbbf24;
        }
        @media (max-width: 420px) {
          .stats-bar {
            flex-direction: column;
            gap: 8px;
          }
          .stat-item {
            flex-direction: row;
            justify-content: space-between;
            min-width: auto;
            width: 100%;
          }
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
          padding: 14px 28px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn.primary {
          background: #ffffff;
          color: #000000;
          border: 2px solid #ffffff;
        }
        .btn.primary:hover:not(:disabled) {
          background: #f4f4f5;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(255,255,255,0.2);
        }
        .btn.primary:active {
          transform: translateY(0);
        }
        .btn.primary.busy {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .btn.secondary {
          background: transparent;
          color: #ffffff;
          border: 2px solid rgba(255,255,255,0.2);
        }
        .btn.secondary:hover:not(:disabled) {
          border-color: #ffffff;
          background: rgba(255,255,255,0.1);
        }
        .btn.ghost {
          background: transparent;
          color: var(--dim);
          border: 1px solid rgba(255,255,255,0.1);
          padding: 10px 16px;
          font-size: 13px;
        }
        .btn.ghost:hover {
          border-color: rgba(255,255,255,0.3);
          color: var(--text);
        }

        .error {
          margin-top: 24px;
          color: #fca5a5;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.2);
          padding: 16px 20px;
          border-radius: 12px;
          font-size: 14px;
          max-width: 900px;
          width: 100%;
          text-align: center;
        }

        .comparison {
          margin-top: 24px;
          width: 100%;
          max-width: 900px;
          padding: 20px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          animation: slideIn 0.4s ease;
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .comparison-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--dim);
          margin-bottom: 12px;
        }
        .comparison-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        .comparison-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .comparison-label {
          font-size: 12px;
          color: var(--dim);
          font-weight: 500;
        }
        .comparison-value {
          font-size: 15px;
          font-weight: 600;
        }
        .comparison-value.up {
          color: #10b981;
        }
        .comparison-value.down {
          color: #ef4444;
        }
        @media (max-width: 600px) {
          .comparison-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }

        .card {
          margin-top: 32px;
          width: 100%;
          max-width: 900px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          padding: 24px;
          transition: all 0.3s ease;
        }
        .card:hover {
          border-color: rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.05);
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
        .rarity-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .rarity-badge.rare {
          background: rgba(139,92,246,0.15);
          color: #c4b5fd;
          border: 1px solid rgba(139,92,246,0.3);
        }
        .rarity-badge.popular {
          background: rgba(251,191,36,0.15);
          color: #fde68a;
          border: 1px solid rgba(251,191,36,0.3);
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
          margin-top: 24px;
          width: 100%;
          max-width: 900px;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          background: rgba(255,255,255,0.03);
          overflow: hidden;
          transition: all 0.3s ease;
        }
        .panel:hover {
          border-color: rgba(255,255,255,0.2);
        }
        .panel-head {
          padding: 16px 20px;
          font-size: 15px;
          font-weight: 600;
          color: #ffffff;
          background: rgba(255,255,255,0.03);
          border-bottom: 1px solid rgba(255,255,255,0.08);
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

        .foot {
          margin-top: 18px;
          font-size: 12px;
          color: var(--dim);
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .zora-link {
          color: #22d3ee;
          text-decoration: none;
          font-weight: 600;
          transition: all 0.2s ease;
        }
        .zora-link:hover {
          color: #a855f7;
          text-decoration: underline;
        }
        .footer-stats {
          font-size: 13px;
          color: #fbbf24;
          font-weight: 700;
          padding: 6px 12px;
          background: rgba(251,191,36,0.1);
          border-radius: 8px;
          border: 1px solid rgba(251,191,36,0.2);
          display: inline-block;
        }
      `}</style>
    </main>
  );
}