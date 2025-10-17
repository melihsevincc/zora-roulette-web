"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** =========================
 *  Public config (browser)
 *  ========================= */
const ZORA_KEY = process.env.NEXT_PUBLIC_ZORA_API_KEY || "";

// Tarayıcıdan denenecek GraphQL hostları (sıralı fallback)
const GQL_HOSTS = [
  "https://coins.zora.co/graphql",
  "https://api.zora.co/graphql",
  "https://zora.co/graphql",
] as const;

/** =========================
 *  Types
 *  ========================= */
type LogLine = { t: string; type: "ok" | "warn" | "info" };

type Coin = {
  name: string;
  symbol?: string;
  address: string;
  marketCap?: number | string;
  volume24h?: number | string;
  uniqueHolders?: number | string;
  change24h?: number;
  marketCapDelta24h?: number;
  createdAt?: number | string;
  decimals?: number;
};

type ExploreNode = {
  id?: string;
  name?: string;
  address?: string;
  symbol?: string;
  marketCap?: number | string;
  volume24h?: number | string;
  uniqueHolders?: number | string;
  createdAt?: number | string;
};
type ExploreEdge = { node?: ExploreNode };
type ExploreResult = { exploreList?: { edges?: ExploreEdge[] } };

type HolderNode = { owner?: string; ownerEns?: string; balance?: string };
type CommentNodeRaw = { comment?: string; timestamp?: number; userProfile?: { username?: string } };
type SwapNodeRaw = { side?: string; amount?: number | string; usd?: number | string; timestamp?: number };

type CoinRaw = {
  id?: string;
  name?: string;
  address?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string | number;
  marketCap?: string | number;
  volume24h?: string | number;
  uniqueHolders?: string | number;
  createdAt?: string | number;
  change24h?: number;
  marketCapDelta24h?: number;
  holders?: { edges?: Array<{ node?: HolderNode }> };
  comments?: { edges?: Array<{ node?: CommentNodeRaw }> };
  swaps?: { edges?: Array<{ node?: SwapNodeRaw }> };
};
type CoinDetailsResult = { zora20Token?: CoinRaw | null };

// GraphQL envelope
type GqlEnvelope<T> = { data?: T };

// Edge type helper
type EdgeNode<T> = { node?: T };

type DetailsBlock = {
  comments?: Array<{ node?: CommentNodeRaw }>;
  swaps?: Array<{ node?: SwapNodeRaw }>;
  holders?: Array<{ node?: HolderNode }>;
};

type SpinResp = {
  ok: boolean;
  coin?: Coin | null;
  details?: DetailsBlock | null;
  error?: string;
};

/** =========================
 *  Formatting helpers
 *  ========================= */
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
function shortAddr(a: string) {
  if (!a) return "";
  if (a.includes(".")) return a;
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** =========================
 *  Browser-side GQL helpers
 *  ========================= */
async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, ms = 6000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}
function hasData<T>(x: unknown): x is GqlEnvelope<T> {
  return isRecord(x) && "data" in x;
}

async function gqlBrowser<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let lastErr: unknown = null;
  for (const host of GQL_HOSTS) {
    try {
      const r = await fetchWithTimeout(
        host,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(ZORA_KEY ? { authorization: `Bearer ${ZORA_KEY}` } : {}),
          },
          body: JSON.stringify({ query, variables }),
          cache: "no-store",
        },
        6000
      );
      if (!r.ok) {
        lastErr = new Error(`HTTP ${r.status} @ ${host}`);
        continue;
      }
      const j: unknown = await r.json().catch(() => ({}));
      if (hasData<T>(j) && j.data !== undefined) return j.data as T;
      lastErr = new Error(`Bad payload @ ${host}`);
    } catch (e: unknown) {
      lastErr = e;
      // sonraki host'u dene
    }
  }
  throw lastErr ?? new Error("All hosts failed");
}

async function exploreTopVolumeClient(first: number): Promise<ExploreEdge[]> {
  const query = `
    query Explore($first:Int!) {
      exploreList(orderBy: VOLUME_24H, first: $first) {
        edges { node { id name address symbol marketCap volume24h uniqueHolders createdAt } }
      }
    }`;
  const data = await gqlBrowser<ExploreResult>(query, { first });
  return data.exploreList?.edges ?? [];
}

async function coinDetailsClient(address: string): Promise<{
  coin: CoinRaw | null;
  holders: HolderNode[];
  comments: CommentNodeRaw[];
  swaps: SwapNodeRaw[];
}> {
  const query = `
    query Coin($address: String!) {
      zora20Token(address: $address) {
        id name address symbol decimals totalSupply marketCap volume24h uniqueHolders createdAt
        holders(first: 10)  { edges { node { owner ownerEns balance } } }
        comments(first: 20) { edges { node { comment timestamp userProfile { username } } } }
        swaps(first: 30)    { edges { node { side amount usd timestamp } } }
      }
    }`;
  const data = await gqlBrowser<CoinDetailsResult>(query, { address });
  const t = data.zora20Token ?? null;

  const holdersEdges = t?.holders?.edges ?? [];
  const commentsEdges = t?.comments?.edges ?? [];
  const swapsEdges = t?.swaps?.edges ?? [];

  const holders: HolderNode[] = holdersEdges
    .map((e: EdgeNode<HolderNode>) => e?.node ?? {})
    .filter((n: HolderNode | Record<string, unknown>): n is HolderNode => isRecord(n));

  const comments: CommentNodeRaw[] = commentsEdges
    .map((e: EdgeNode<CommentNodeRaw>) => e?.node ?? {})
    .filter((n: CommentNodeRaw | Record<string, unknown>): n is CommentNodeRaw => isRecord(n));

  const swaps: SwapNodeRaw[] = swapsEdges
    .map((e: EdgeNode<SwapNodeRaw>) => e?.node ?? {})
    .filter((n: SwapNodeRaw | Record<string, unknown>): n is SwapNodeRaw => isRecord(n));

  return { coin: t, holders, comments, swaps };
}

/** =========================
 *  Component
 *  ========================= */
export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SpinResp | null>(null);
  const [spins, setSpins] = useState(0);

  const [autoSpin, setAutoSpin] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([
    { t: "💫 Live terminal ready. Press SPIN or enable Auto-Spin.", type: "info" },
  ]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = new Audio("/sfx/click.mp3");
    el.preload = "auto";
    el.volume = 0.5;
    audioRef.current = el;
  }, []);

  function pushLog(line: LogLine) {
    setLog((prev) => {
      const next = [...prev, line].slice(-200);
      requestAnimationFrame(() => {
        if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
      });
      return next;
    });
  }

  const spin = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    wheelRef.current?.classList.add("spin-3d");
    pushLog({ t: "🎰 Spinning…", type: "info" });

    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        void audioRef.current.play(); // Promise ignore
      }
    } catch {
      /* ignore */
    }

    try {
      // 1) Explore (client)
      const edges = await exploreTopVolumeClient(200);
      if (!edges?.length) {
        pushLog({ t: "⚠ spin failed: no-coins (client explore empty)", type: "warn" });
        return;
      }

      // Pencereden rastgele seçim
      const nodes: ExploreNode[] = edges
        .map((e: ExploreEdge) => e.node)
        .filter((n: ExploreNode | undefined): n is ExploreNode => Boolean(n));

      const win = 12;
      const start = Math.max(0, Math.floor(Math.random() * Math.max(1, nodes.length - win)));
      const windowNodes = nodes.slice(start, start + win);
      const chosenIdx = Math.floor(Math.random() * Math.min(win, nodes.length));
      const chosen: ExploreNode = windowNodes[chosenIdx] ?? nodes[0];

      // 2) Details (client)
      const chosenAddr = chosen.address || chosen.id || "";
      const d = await coinDetailsClient(chosenAddr);

      const coin: Coin = {
        name: d.coin?.name || chosen.name || "Unknown",
        symbol: d.coin?.symbol ?? chosen.symbol,
        address: d.coin?.address ?? chosen.address ?? chosen.id ?? "",
        marketCap: d.coin?.marketCap ?? chosen.marketCap,
        volume24h: d.coin?.volume24h ?? chosen.volume24h,
        uniqueHolders: d.coin?.uniqueHolders ?? chosen.uniqueHolders,
        change24h: d.coin?.change24h,
        marketCapDelta24h: d.coin?.marketCapDelta24h,
        createdAt: d.coin?.createdAt ?? chosen.createdAt,
        decimals: typeof d.coin?.decimals === "number" ? d.coin.decimals : 18,
      };

      const details: DetailsBlock = {
        comments: (d.comments || []).map(c => ({ node: c })),
        swaps: (d.swaps || []).map(s => ({ node: s })),
        holders: (d.holders || []).map(h => ({ node: h })),
      };

      setData({ ok: true, coin, details });
      setSpins((s) => s + 1);
      pushLog({
        t: `✔ ${coin.name}${coin.symbol ? ` (${coin.symbol})` : ""} — cap:${compact(
          coin.marketCap
        )} vol24h:${compact(coin.volume24h)}`,
        type: "ok",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog({ t: `⚠ spin failed: ${msg}`, type: "warn" });
    } finally {
      setLoading(false);
      setTimeout(() => wheelRef.current?.classList.remove("spin-3d"), 300);
    }
  }, [loading]);

  // Auto-Spin (15s)
  useEffect(() => {
    if (!autoSpin) return;
    const id = setInterval(() => {
      if (!loading) {
        void spin();
      }
    }, 15000);
    return () => clearInterval(id);
  }, [autoSpin, loading, spin]);

  async function share() {
    const c = data?.coin;
    if (!c) return;
    const url = `https://zora.co/coin/${c.address}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast("Link copied!");
    } catch {
      window.alert(url);
      setToast("Link ready!");
    }
    setTimeout(() => setToast(null), 1500);
  }

  const c = data?.coin ?? null;
  const createdDate =
    c?.createdAt != null
      ? new Date(typeof c.createdAt === "number" ? c.createdAt : Date.parse(String(c.createdAt)))
      : null;

  return (
    <main className="bg-grid">
      <div className="container center">
        {/* Header */}
        <div className="mt-10 text-center">
          <div className="text-2xl neon-cyan">Zora Roulette</div>
          <div className="text-xs text-dim mt-4">
            Live coin picker with Zora GraphQL • not financial advice
          </div>
        </div>

        {/* Roulette */}
        <div className="roulette-wrap mt-10">
          <div
            ref={wheelRef}
            className="roulette-ring"
            style={{
              transform: loading ? "rotate(720deg)" : "rotate(0deg)",
              transition: loading
                ? "transform 1.2s cubic-bezier(0.22,1,0.36,1)"
                : "transform .6s ease",
              filter: "drop-shadow(0 0 30px rgba(34,211,238,0.25))",
            }}
          />
          <div className="center-disc">
            <div className="text-center">
              <div className="badge">Mode</div>
              <div className="text-lg" style={{ fontWeight: 700 }}>
                Volume
              </div>
              <div className="text-xs text-dim mt-4">spins: {spins}</div>
            </div>
          </div>
          <div className="pointer" />
        </div>

        {/* Actions */}
        <div className="row mt-6" style={{ gap: 12 }}>
          <button className="btn" onClick={spin} disabled={loading}>
            {loading ? "Spinning..." : "Spin"}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => {
              const next = !autoSpin;
              setAutoSpin(next);
              setLog((prev) => [
                ...prev,
                { t: next ? "🔁 Auto-Spin enabled (every 15s)." : "⏹ Auto-Spin disabled.", type: "info" },
              ]);
            }}
          >
            {autoSpin ? "Stop Auto-Spin" : "Start Auto-Spin"}
          </button>

          <button className="btn btn-secondary" onClick={share} disabled={!c}>
            Share this coin
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className="card-glass card-glow mt-4" role="status" aria-live="polite" style={{ padding: 10 }}>
            {toast}
          </div>
        )}

        {/* Coin Card */}
        {c && (
          <div className="card-glass card-glow mt-10" style={{ width: "100%", maxWidth: 900 }}>
            <div className="row">
              <div>
                <div className="text-xl neon-yellow" style={{ fontWeight: 700 }}>
                  {c.name} {c.symbol ? `(${c.symbol})` : ""}
                </div>
                <div className="text-xs text-dim break-all">{c.address}</div>
              </div>
              <a href={`https://zora.co/coin/${c.address}`} target="_blank" rel="noreferrer" className="link text-sm">
                View on Zora →
              </a>
            </div>

            <div className="grid mt-4">
              <div className="card-glass">
                <div className="text-xs text-dim">Market Cap</div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{compact(c.marketCap)}</div>
              </div>
              <div className="card-glass">
                <div className="text-xs text-dim">24h Volume</div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{compact(c.volume24h)}</div>
              </div>
              <div className="card-glass">
                <div className="text-xs text-dim">Holders</div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{compact(c.uniqueHolders)}</div>
              </div>
              <div className="card-glass">
                <div className="text-xs text-dim">24h Cap Δ</div>
                <div
                  style={{
                    fontWeight: 700,
                    marginTop: 6,
                    color: (Number(c.marketCapDelta24h ?? c.change24h) ?? 0) >= 0 ? "#86efac" : "#fca5a5",
                  }}
                >
                  {pct(Number(c.marketCapDelta24h ?? c.change24h))}
                </div>
              </div>
            </div>

            {createdDate && (
              <div className="text-xs text-dim mt-4">
                Created:{" "}
                {createdDate.toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}{" "}
                • {timeAgo(createdDate.getTime())}
              </div>
            )}
          </div>
        )}

        {/* Recent Swaps */}
        {data?.details?.swaps?.length ? (
          <div className="card-glass card-glow mt-10" style={{ width: "100%", maxWidth: 900 }}>
            <div className="text-xl mb-4" style={{ fontWeight: 700 }}>
              Recent Swaps — Top 10
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Side</th>
                  <th className="num">Amount</th>
                  <th className="num">~USD</th>
                  <th>Date</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {data.details.swaps.slice(0, 10).map((edge, i) => {
                  const s = edge.node;
                  if (!s) return null;

                  const side = String(s.side || "BUY").toUpperCase();
                  const isBuy = side === "BUY";
                  const amount = s.amount || "0";
                  const usd = s.usd;

                  // Parse timestamp
                  const ts = s.timestamp || Date.now();
                  const date = new Date(typeof ts === "number" ? ts * 1000 : ts);
                  const dateStr = isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  });
                  const timeStr = isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  });

                  return (
                    <tr key={`swap-${i}`}>
                      <td>{i + 1}.</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: isBuy ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                            color: isBuy ? "#86efac" : "#fca5a5",
                            padding: "4px 10px",
                            borderRadius: 6,
                            fontWeight: 700,
                          }}
                        >
                          {isBuy ? "▲ BUY" : "▼ SELL"}
                        </span>
                      </td>
                      <td className="num">{compact(amount)}</td>
                      <td className="num">{usd ? `$${compact(usd)}` : "—"}</td>
                      <td>{dateStr}</td>
                      <td>{timeStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Top Holders */}
        {data?.details?.holders?.length ? (
          <div className="card-glass card-glow mt-10" style={{ width: "100%", maxWidth: 900 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <div className="text-xl" style={{ fontWeight: 700 }}>
                Top Holders — Share within Top 10
              </div>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Holder</th>
                  <th className="num">Balance</th>
                  <th className="num">% of Top 10</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const holders = data.details!.holders!;
                  const balances = holders.map(edge => {
                    const h = edge.node;
                    if (!h) return 0;
                    const bal = h.balance || "0";
                    return parseFloat(String(bal).replace(/,/g, "")) || 0;
                  });
                  const total = balances.reduce((a, b) => a + b, 0);

                  return holders.slice(0, 10).map((edge, i) => {
                    const h = edge.node;
                    if (!h) return null;

                    const addr = h.ownerEns || shortAddr(h.owner || "");
                    const bal = balances[i];
                    const pct = total > 0 ? (bal / total) * 100 : 0;

                    return (
                      <tr key={`holder-${i}`}>
                        <td>{i + 1}.</td>
                        <td className="addr">{addr}</td>
                        <td className="num">{compact(bal)}</td>
                        <td className="num">{pct.toFixed(2)}%</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Terminal Log */}
        <div className="terminal mt-10" ref={termRef} aria-label="Live log">
          {log.map((l: LogLine, i: number) => (
            <div className={`line ${l.type}`} key={`${l.type}-${i}`}>
              {l.t}
            </div>
          ))}
        </div>

        <div className="text-xs text-dim mt-10">Casino vibes only — have fun.</div>
      </div>
    </main>
  );
}