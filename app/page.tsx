"use client";

import { useState } from "react";

type SpinResp = {
  ok: boolean;
  coin?: any;
  details?: { swaps: any[]; comments: any[]; holders: any[] };
  error?: string;
};

function compact(n?: number) {
  if (n == null || isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2).replace(/\.00$/, "");
}
function pct(v?: number) {
  if (v == null || isNaN(v)) return "N/A";
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

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SpinResp | null>(null);

  async function spin() {
    setLoading(true);
    const r = await fetch("/api/spin", { cache: "no-store" });
    const j: SpinResp = await r.json();
    setData(j);
    setLoading(false);
  }

  const c = data?.coin;

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center p-6">
      <div className="text-3xl font-bold mt-6">🎰 Zora Roulette — Web</div>
      <p className="text-sm text-neutral-400 mt-2">Live coin picker with Zora Coins SDK</p>

      <button
        onClick={spin}
        disabled={loading}
        className="mt-6 px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold disabled:opacity-60"
      >
        {loading ? "Spinning..." : "Spin"}
      </button>

      {data && !data.ok && (
        <div className="mt-6 text-red-400">Error: {data.error}</div>
      )}

      {c && (
        <div className="mt-8 w-full max-w-2xl rounded-2xl border border-white/10 p-5 bg-white/5">
          <div className="text-xl font-semibold">
            {c.name} {c.symbol ? `(${c.symbol})` : ""}
          </div>
          <div className="text-neutral-400 text-xs break-all">0x{c.address?.replace(/^0x/, "")}</div>

          <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
            <div className="bg-white/5 rounded-xl p-3">
              <div className="text-neutral-400">Market Cap</div>
              <div className="text-cyan-300 font-semibold">{compact(Number(c.marketCap))}</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <div className="text-neutral-400">24h Volume</div>
              <div className="text-pink-300 font-semibold">{compact(Number(c.volume24h))}</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <div className="text-neutral-400">Holders</div>
              <div className="text-yellow-300 font-semibold">{compact(Number(c.uniqueHolders))}</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <div className="text-neutral-400">24h Cap Δ</div>
              <div className={(Number(c.marketCapDelta24h) > 0 ? "text-emerald-300" : "text-red-300") + " font-semibold"}>
                {pct(Number(c.marketCapDelta24h ?? c.change24h))}
              </div>
            </div>
          </div>

          {c.createdAt && (
            <div className="mt-3 text-xs text-neutral-400">
              Created:{" "}
              {new Date(typeof c.createdAt === "number" ? c.createdAt : Date.parse(c.createdAt))
                .toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}
              {" • "}
              {timeAgo(typeof c.createdAt === "number" ? c.createdAt : Date.parse(c.createdAt))}
            </div>
          )}

          <a
            href={c.address ? `https://zora.co/coin/${c.address}` : "https://zora.co/coins"}
            target="_blank"
            className="inline-block mt-4 text-cyan-400 underline"
          >
            View on Zora →
          </a>
        </div>
      )}

      <div className="mt-10 text-xs text-neutral-500">Not financial advice — just onchain vibes.</div>
    </main>
  );
}
