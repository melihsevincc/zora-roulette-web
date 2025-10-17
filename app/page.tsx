"use client";

import { useRef, useState } from "react";

/* ---------- Types (Tipler) ---------- */
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
  usd?: number | string;
  ts?: number | string;
};

type CommentUI = {
  user?: string;
  text?: string;
  ts?: number | string;
};

type HolderRow = {
  owner: string;
  balance: string | number;
  ens?: string;
};

type HoldersPayload = HolderRow[] | null | undefined;

type DetailsBlock = {
  swaps?: unknown[];
  comments?: CommentUI[];
  holders?: HoldersPayload;
};

type SpinResp = {
  ok: boolean;
  coin?: Coin;
  details?: DetailsBlock;
  error?: string;
};

type LogLevel = "ok" | "warn" | "info";
type LogLine = { t: string; type: LogLevel };

/* ---------- Helpers (Yardımcı Fonksiyonlar) ---------- */
function compact(n?: number | string) {
  const x = typeof n === "string" ? Number(n.toString().replace(/,/g, '')) : n;
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

function toEpochMsLoose(v: number | string): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    const isSeconds = String(v).length <= 10;
    const ms = isSeconds ? v * 1000 : v;
    return ms > 0 && Number.isFinite(ms) ? ms : null;
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    if (isNaN(Number(trimmed))) {
      const p = Date.parse(trimmed); // ISO formatı için (örn: "2023-03-15T12:00:00Z")
      return Number.isFinite(p) && p > 0 ? p : null;
    }
    const n = Number(trimmed.replaceAll(",", ""));
    const isSeconds = String(n).length <= 10;
    const ms = isSeconds ? n * 1000 : n;
    return ms > 0 ? ms : null;
  }
  return null;
}

function tsToDateParts(ts?: number | string): { date: string; time: string } {
  const ms = toEpochMsLoose(ts || "");
  if (ms == null) return { date: "—", time: "—" };
  const d = new Date(ms);
  if (isNaN(d.getTime())) return { date: "—", time: "—" };
  return {
    date: d.toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" }),
  };
}

function shortAddr(a?: string) {
  if (!a) return "";
  if (a.includes(".")) return a;
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
function nowHHMMSS() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}
function holdersArray(h: HoldersPayload): HolderRow[] {
  if (!h) return [];
  return Array.isArray(h) ? h : [];
}
function toNumber(v?: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}
function formatUSD(v?: number | string): string {
  const n = toNumber(v);
  if (n == null) return "—";
  if (Math.abs(n) >= 1) return "~$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return "~$" + n.toFixed(2);
}

// DEĞİŞTİRİLDİ: Bu fonksiyon artık çok basit, çünkü zor işi backend yapıyor.
type UnknownObject = { [key: string]: any };
function coerceSwap(s: UnknownObject): SwapUI {
  const sideRaw = s.type?.toUpperCase();
  return {
    side: sideRaw === "BUY" || sideRaw === "SELL" ? sideRaw : undefined,
    amount: toNumber(s.amount) ?? undefined,
    usd: toNumber(s.amountUSD) ?? undefined,
    ts: s.timestamp,
  };
}

/* ---------- Component (Ana Arayüz Bileşeni) ---------- */
export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SpinResp | null>(null);
  const [spins, setSpins] = useState<number>(0);
  const [verbose, setVerbose] = useState<boolean>(true);
  const [log, setLog] = useState<LogLine[]>([{ t: "💫 Canlı terminal hazır. SPIN'e bas.", type: "info" }]);
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
      setData(null); // Yeni spin öncesi eski veriyi temizle
      wheelRef.current?.classList.add("spinning");
      pushLog({ t: `[${nowHHMMSS()}] 🎰 Çevriliyor…`, type: "info" });

      const r = await fetch("/api/spin");
      const j: SpinResp = await r.json();

      if (verbose) {
        console.log("--- /api/spin'den Gelen Yanıt ---");
        console.log(JSON.parse(JSON.stringify(j))); // Konsolda daha iyi incelemek için
        console.log("------------------------------------");
      }

      if (!j.ok || !j.coin) {
        pushLog({ t: `[${nowHHMMSS()}] ⚠ Çevirme başarısız: ${j.error ?? "Coin bilgisi alınamadı."}`, type: "warn" });
        setData(j);
        return;
      }

      const normalizedSwaps: SwapUI[] = Array.isArray(j.details?.swaps)
        ? j.details.swaps.map((x) => coerceSwap(x as UnknownObject))
        : [];

      setData({
        ...j,
        details: { ...(j.details ?? {}), swaps: normalizedSwaps },
      });

      setSpins((s) => s + 1);

      const c = j.coin!;
      pushLog({
        t: `✔ ${c.name}${c.symbol ? ` (${c.symbol})` : ""} — cap:${compact(c.marketCap)} vol24h:${compact(c.volume24h)} holders:${compact(c.uniqueHolders)}`,
        type: "ok",
      });

      if (verbose && normalizedSwaps.length > 0) {
        const buys = normalizedSwaps.filter((s) => s.side === "BUY").length;
        const sells = normalizedSwaps.filter((s) => s.side === "SELL").length;
        pushLog({ t: `↳ işlemler(ilk 10): ${normalizedSwaps.length} (↑ ALIM ${buys} / ↓ SATIM ${sells})`, type: "info" });
      }

    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen bir hata oluştu.";
      pushLog({ t: `[${nowHHMMSS()}] ⚠ Çevirme başarısız: ${msg}`, type: "warn" });
    } finally {
      setLoading(false);
      setTimeout(() => wheelRef.current?.classList.remove("spinning"), 350);
    }
  }

  async function share() {
    const c = data?.coin;
    if (!c?.address) {
      setToast("Paylaşılacak bir coin yok.");
      setTimeout(() => setToast(null), 1200);
      return;
    }
    const url = `https://zora.co/coin/${c.address}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast("Link kopyalandı!");
      pushLog({ t: `🔗 Kopyalandı: ${url}`, type: "info" });
    } catch (err) {
      console.error("Kopyalama hatası:", err);
      prompt("Linki kopyala:", url);
    }
    setTimeout(() => setToast(null), 1500);
  }

  const c = data?.coin ?? null;
  const createdMs = c?.createdAt ? toEpochMsLoose(String(c.createdAt)) : null;
  const details = data?.details;

  const swapsTop10: SwapUI[] = (details?.swaps as SwapUI[]) ?? [];
  const holdersTop10: HolderRow[] = holdersArray(details?.holders).slice(0, 10);
  const holdersTotal = holdersTop10.reduce((acc, h) => acc + (toNumber(h.balance) ?? 0), 0);
  const holdersPercentages = holdersTop10.map((h) => {
    const n = toNumber(h.balance) ?? 0;
    return holdersTotal > 0 ? Math.max(0, Math.min(100, (n / holdersTotal) * 100)) : 0;
  });

  return (
    <main className="screen">
      <header className="header">
        <h1 className="title">
          <span className="emoji">🎰</span> Zora Rulet — Web
        </h1>
        <p className="subtitle">Zora GraphQL ile canlı coin seçici • yatırım tavsiyesi değildir</p>
      </header>
      <section className="roulette">
        <div ref={wheelRef} className="wheel">
          <div className="ring" />
          <div className="center">
            <div className="center-copy">
              <div className="mode">Mod</div>
              <div className="mode-value">Hacim</div>
              <div className="spins">çevirme: {spins}</div>
            </div>
          </div>
          <div className="pointer" />
        </div>
      </section>
      <section className="toolbar">
        <div className="actions">
          <button onClick={spin} disabled={loading} className={`btn ${loading ? "busy" : ""}`}>
            {loading ? "Çevriliyor..." : "Spin"}
          </button>
          <button onClick={share} className="btn secondary" disabled={!c}>
            Paylaş
          </button>
        </div>
        <div className="toggles">
          <label className="toggle">
            <input
              type="checkbox"
              checked={verbose}
              onChange={(e) => setVerbose(e.target.checked)}
            />
            <span>Detaylı log</span>
          </label>
          <button
            className="btn ghost"
            onClick={() => setLog([{ t: "🧹 Log temizlendi.", type: "info" }])}
          >
            Log&apos;u Temizle
          </button>
        </div>
      </section>
      {data && !data.ok && (
        <div className="error">Hata: {data.error}</div>
      )}
      {c && (
        <section className="card">
          <div className="card-row">
            <div>
              <div className="coin-name">
                {c.name} {c.symbol ? <span className="symbol">({c.symbol})</span> : null}
              </div>
              <div className="address">{c.address ? `0x${c.address.replace(/^0x/, "")}` : ""}</div>
            </div>
            <a
              href={c.address ? `https://zora.co/coin/${c.address}` : "https://zora.co/coins"}
              target="_blank"
              rel="noreferrer"
              className="link"
            >
              Zora&apos;da Görüntüle →
            </a>
          </div>
          <div className="grid">
            <div className="metric">
              <div className="label">Piyasa Değeri</div>
              <div className="value cyan">{compact(c.marketCap)}</div>
            </div>
            <div className="metric">
              <div className="label">24s Hacim</div>
              <div className="value pink">{compact(c.volume24h)}</div>
            </div>
            <div className="metric">
              <div className="label">Sahipler</div>
              <div className="value yellow">{compact(c.uniqueHolders)}</div>
            </div>
            <div className="metric">
              <div className="label">24s Değişim</div>
              <div
                className={`value ${Number(c.marketCapDelta24h ?? c.change24h) > 0 ? "green" : "red"}`}
              >
                {pct(Number(c.marketCapDelta24h ?? c.change24h))}
              </div>
            </div>
          </div>
          {createdMs && (
            <div className="created">
              Oluşturulma:{" "}
              {new Date(createdMs).toLocaleDateString("tr-TR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
              {" • "}
              {(() => {
                const diff = Date.now() - createdMs;
                const s = Math.floor(diff / 1000);
                if (s < 60) return `${s}sn önce`;
                const m = Math.floor(s / 60);
                if (m < 60) return `${m}dk önce`;
                const h = Math.floor(m / 60);
                if (h < 24) return `${h}sa önce`;
                const d = Math.floor(h / 24);
                return `${d}g önce`;
              })()}
            </div>
          )}
        </section>
      )}
      {swapsTop10.length > 0 && (
        <section className="panel">
          <div className="panel-head">Son İşlemler — İlk 10</div>
          <div className="table">
            <div className="row head">
              <div className="cell idx">#</div>
              <div className="cell side">TÜR</div>
              <div className="cell amt">MİKTAR</div>
              <div className="cell usd">~USD</div>
              <div className="cell date">TARİH</div>
              <div className="cell time">SAAT</div>
            </div>
            {swapsTop10.map((s, i) => {
              const parts = tsToDateParts(s.ts);
              const side = (s.side ?? "BUY");
              const sideClass = side === "BUY" ? "buy" : "sell";
              return (
                <div className="row" key={`swap-${i}`}>
                  <div className="cell idx">{i + 1}.</div>
                  <div className={`cell side tag ${sideClass}`}>
                    {side === "BUY" ? "▲ ALIM" : "▼ SATIM"}
                  </div>
                  <div className="cell amt">{compact(s.amount)}</div>
                  <div className="cell usd">{formatUSD(s.usd)}</div>
                  <div className="cell date">{parts.date}</div>
                  <div className="cell time">{parts.time}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {holdersTop10.length > 0 && (
        <section className="panel">
          <div className="panel-head">En Büyük Sahipler — İlk 10 İçindeki Pay</div>
          <div className="bars">
            {holdersTop10.map((h, i) => {
              const label = shortAddr(h.ens ?? h.owner);
              const p = holdersPercentages[i] ?? 0;
              return (
                <div className="bar-row" key={`h-${i}`}>
                  <div className="bar-label">{i + 1}. {label}</div>
                  <div className="bar-track" aria-label={`${label} ${p.toFixed(2)}%`}>
                    <div className="bar-fill" style={{ width: `${p}%` }} />
                    <div className="bar-cap">{p.toFixed(2)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="panel-foot">
            {holdersTotal > 0
              ? "Yüzdeler, ilk 10 sahibinin toplam bakiyesine göredir."
              : "Bakiyeler alınamadı, yüzdeler sıfır olabilir."}
          </div>
        </section>
      )}
      <section className="terminal" aria-label="Canlı log">
        <div className="term-head">Terminal</div>
        <div className="term-body" ref={termRef}>
          {log.map((l, i) => (
            <div className={`line ${l.type}`} key={`${l.type}-${i}`}>{l.t}</div>
          ))}
        </div>
      </section>
      {toast && <div className="toast">{toast}</div>}
      <footer className="foot">Sadece eğlence için — iyi şanslar.</footer>
      <style jsx global>{`
        :root {
          --bg1: #050b12; --bg2: #0b1f2e; --text: #e6f0ff; --dim: #9fb2c5;
          --panel: rgba(255,255,255,0.06); --panel-brd: rgba(255,255,255,0.12);
          --glow: rgba(34,211,238,0.28); --buy: #34d399; --sell: #f87171;
        }
        * { box-sizing: border-box; }
        html, body { height: 100%; }
        body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Inter, Roboto, Arial; color: var(--text); }
      `}</style>
      <style jsx>{`
        .screen {
          min-height: 100vh;
          background:
            radial-gradient(1200px 600px at 50% -10%, var(--bg2) 0%, var(--bg1) 45%, #000 100%),
            radial-gradient(600px 300px at 85% 10%, rgba(34,211,238,0.12), transparent 70%),
            radial-gradient(600px 300px at 15% 15%, rgba(168,85,247,0.12), transparent 70%);
          display: flex; flex-direction: column; align-items: center; padding: 32px 20px 40px;
        }
        .header { text-align: center; margin-top: 8px; }
        .title {
          font-size: 28px; font-weight: 900; letter-spacing: .4px;
          background: linear-gradient(90deg, #22d3ee, #a855f7);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          filter: drop-shadow(0 6px 30px rgba(34,211,238,0.25));
        }
        .emoji { margin-right: 6px; }
        .subtitle { margin-top: 6px; font-size: 12px; color: var(--dim); }

        .roulette { margin-top: 28px; }
        .wheel {
          position: relative; width: 260px; height: 260px;
          perspective: 900px; transform-style: preserve-3d; transition: transform 0.3s ease;
          filter: drop-shadow(0 10px 40px rgba(34,211,238,0.18));
        }
        .wheel.spinning { animation: spin 1.15s cubic-bezier(0.22,1,0.36,1); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(720deg); } }

        .ring {
          position: absolute; inset: 0; border-radius: 9999px;
          background: conic-gradient(
            from 0deg,
            #10b981 0 18deg, #ef4444 18deg 36deg, #3b82f6 36deg 54deg, #f59e0b 54deg 72deg, #22d3ee 72deg 90deg,
            #a855f7 90deg 108deg, #e11d48 108deg 126deg, #22c55e 126deg 144deg, #06b6d4 144deg 162deg, #84cc16 162deg 180deg,
            #ef4444 180deg 198deg, #10b981 198deg 216deg, #3b82f6 216deg 234deg, #f59e0b 234deg 252deg, #a855f7 252deg 270deg,
            #22d3ee 270deg 288deg, #e11d48 288deg 306deg, #06b6d4 306deg 324deg, #84cc16 324deg 342deg, #22c55e 342deg 360deg
          );
          box-shadow: inset 0 0 30px rgba(0,0,0,0.35), 0 0 40px rgba(34,211,238,0.18);
        }
        .center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
        .center::before {
          content: ""; width: 140px; height: 140px; border-radius: 9999px;
          background: rgba(0,0,0,0.6); border: 1px solid var(--panel-brd);
          box-shadow: 0 10px 40px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.03);
          backdrop-filter: blur(6px); position: absolute;
        }
        .center-copy { position: relative; text-align: center; z-index: 2; }
        .mode { font-size: 12px; color: var(--dim); }
        .mode-value { margin-top: 4px; font-weight: 800; filter: drop-shadow(0 0 18px rgba(34,211,238,0.35)); }
        .spins { margin-top: 8px; font-size: 12px; color: var(--dim); }
        .pointer {
          position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
          width: 0; height: 0; border-left: 10px solid transparent;
          border-right: 10px solid transparent; border-bottom: 14px solid #22d3ee;
          filter: drop-shadow(0 0 8px rgba(34,211,238,0.7));
        }
        .toolbar {
          margin-top: 22px; display: flex; align-items: center; justify-content: center;
          gap: 18px; flex-wrap: wrap;
        }
        .actions, .toggles { display: flex; gap: 10px; align-items: center; }
        .toggle { display: inline-flex; gap: 8px; align-items: center; font-size: 12px; color: var(--dim); }

        .btn {
          appearance: none; border: 0; padding: 12px 18px; border-radius: 14px;
          color: #001510; font-weight: 800;
          background: linear-gradient(180deg, #34d399, #10b981);
          box-shadow: 0 12px 30px rgba(16,185,129,0.35), 0 0 0 1px rgba(255,255,255,0.08) inset, 0 1px 0 rgba(255,255,255,0.18) inset;
          cursor: pointer; transition: transform .15s ease, box-shadow .15s ease, filter .15s ease, opacity .15s ease;
        }
        .btn:hover { transform: translateY(-1px); filter: saturate(1.1); }
        .btn:active { transform: translateY(1px) scale(0.99); }
        .btn.busy { opacity: .7; cursor: not-allowed; }
        .btn.secondary {
          background: linear-gradient(180deg, #93c5fd, #60a5fa); color: #001225;
          box-shadow: 0 12px 30px rgba(59,130,246,0.35), 0 0 0 1px rgba(255,255,255,0.08) inset, 0 1px 0 rgba(255,255,255,0.18) inset;
        }
        .btn.ghost { background: rgba(255,255,255,0.06); color: var(--text); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1); }

        .error {
          margin-top: 16px; color: #fecaca; background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.25); padding: 10px 12px; border-radius: 12px;
          font-size: 14px; max-width: 680px; width: calc(100% - 32px); text-align: center;
        }
        .card {
          margin-top: 28px; width: 100%; max-width: 900px;
          border-radius: 16px; border: 1px solid var(--panel-brd);
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03));
          backdrop-filter: blur(8px); padding: 16px; position: relative;
        }
        .card::after { content: ""; position: absolute; inset: -1px; border-radius: 16px; box-shadow: 0 0 34px var(--glow); pointer-events: none; opacity: .35; }
        .card-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .coin-name { font-size: 18px; font-weight: 800; letter-spacing: .2px; }
        .symbol { color: #a9c7ff; font-weight: 700; }
        .address { margin-top: 4px; font-size: 12px; color: var(--dim); word-break: break-all; }
        .link { font-size: 12px; color: #89e6ff; text-decoration: underline; }

        .grid { margin-top: 14px; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; }
        @media (max-width: 760px) { .grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
        @media (max-width: 420px) { .grid { grid-template-columns: 1fr; } }
        .metric { border-radius: 14px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 10px 12px; }
        .label { font-size: 12px; color: var(--dim); }
        .value { margin-top: 6px; font-weight: 800; }
        .value.cyan { color: #99f6ff; } .value.pink { color: #ffc2f1; } .value.yellow { color: #ffe39b; }
        .value.green { color: #a7f3d0; } .value.red { color: #fca5a5; }

        .created { margin-top: 10px; font-size: 12px; color: var(--dim); }

        .panel { margin-top: 22px; width: 100%; max-width: 900px; border: 1px solid var(--panel-brd); border-radius: 12px; background: rgba(2,6,15,0.5); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03); overflow: hidden; }
        .panel-head { padding: 10px 12px; font-size: 13px; font-weight: 700; color: #cbe7ff; background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.06); }
        .panel-foot { padding: 10px 12px; font-size: 12px; color: var(--dim); border-top: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03); }

        .table { width: 100%; }
        .row { display: grid; grid-template-columns: 44px 100px 1fr 1fr 120px 80px; gap: 8px; padding: 8px 12px; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .row:last-child { border-bottom: 0; }
        .row.head { background: rgba(255,255,255,0.04); font-size: 12px; color: var(--dim); font-weight: 700; }
        .cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cell.idx { color: var(--dim); }
        .cell.side { font-weight: 800; letter-spacing: .3px; }
        .tag { display: inline-flex; align-items: center; justify-content: center; padding: 6px 10px; border-radius: 10px; width: 90px; color: #001510; }
        .buy { background: var(--buy); }
        .sell { background: var(--sell); color: #240000; }
        .amt, .usd { font-weight: 700; }

        @media (max-width: 760px) { .row { grid-template-columns: 32px 84px 1fr 1fr 100px 70px; } }
        @media (max-width: 520px) { .row { grid-template-columns: 28px 84px 1fr 1fr; } .cell.date, .cell.time { display: none; } }

        .bars { padding: 10px 12px 6px; display: flex; flex-direction: column; gap: 10px; }
        .bar-row { display: grid; grid-template-columns: 220px 1fr; gap: 10px; align-items: center; }
        .bar-label { font-size: 12px; color: #cfe7ff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bar-track { position: relative; height: 20px; border-radius: 9999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.10); overflow: hidden; }
        .bar-fill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #22d3ee, #a855f7); box-shadow: 0 0 18px rgba(34,211,238,0.35) inset; }
        .bar-cap { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 12px; color: #e6f0ff; text-shadow: 0 1px 0 rgba(0,0,0,0.35); }
        @media (max-width: 640px) { .bar-row { grid-template-columns: 1fr; } }

        .terminal { margin-top: 24px; width: 100%; max-width: 900px; border: 1px solid var(--panel-brd); border-radius: 12px; background: rgba(2,6,15,0.6); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03); overflow: hidden; }
        .term-head { padding: 10px 12px; font-size: 12px; color: var(--dim); background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.06); }
        .term-body { max-height: 240px; overflow: auto; padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 12px; line-height: 1.45; }
        .line { padding: 2px 0; }
        .line.ok { color: #b1f0c9; }
        .line.warn { color: #fca5a5; }
        .line.info { color: #9fb2c5; }

        .toast { position: fixed; bottom: 16px; right: 16px; background: rgba(0,0,0,0.75); color: #e6f0ff; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; font-size: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); animation: toast-in .18s ease; }
        @keyframes toast-in { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .foot { margin-top: 18px; font-size: 12px; color: var(--dim); }
      `}</style>
    </main>
  );
}

