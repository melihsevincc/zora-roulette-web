"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  author?: string;
  text?: string;
  date?: string;
  ts?: number | string;
  timestamp?: number | string;
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
    sentiment: "bullish" | "bearish" | "neutral";
    timestamp: number;
    poolSize?: number;
    freshCoins?: number;
    cacheSize?: number;
  };
  error?: string;
};

type Mode = "volume" | "trending" | "new";

type SpinEntry = {
  id: string;
  timestamp: number;
  coin: Coin;
  details?: DetailsBlock;
  stats?: SpinResp["stats"];
  favorite?: boolean;
};

type LeaderboardState = {
  dailyKey: string;
  weeklyKey: string;
  dailyTopStreak: number;
  weeklyTopStreak: number;
  rareFinds: number;
  bestStreak: number;
  totalSpins: number;
};

type AchievementRecord = Record<string, boolean>;

type Filters = {
  marketCap: [number, number];
  holders: [number, number];
  volumeMin: number;
};

type LogLevel = "ok" | "warn" | "info";

type LogLine = { t: string; type: LogLevel };

const MAX_HISTORY = 10;
const STORAGE_KEYS = {
  history: "zora-roulette-history",
  favorites: "zora-roulette-favorites",
  theme: "zora-roulette-theme",
  mute: "zora-roulette-muted",
  watchlist: "zora-roulette-watchlist",
  leaderboard: "zora-roulette-leaderboard",
  achievements: "zora-roulette-achievements",
};

const FILTER_DEFAULTS: Filters = {
  marketCap: [0, 1_000_000_000],
  holders: [0, 5000],
  volumeMin: 0,
};

const ACHIEVEMENT_DEFS = [
  { id: "first-spin", label: "First Spin", description: "Spin the wheel once", icon: "🎯" },
  { id: "lucky-rare", label: "Rare Hunter", description: "Find a coin with under 50 holders", icon: "💎" },
  { id: "streak-5", label: "Hot Streak", description: "Reach a unique streak of 5", icon: "🔥" },
  { id: "streak-10", label: "On Fire", description: "Reach a unique streak of 10", icon: "⚡" },
  { id: "spins-25", label: "High Roller", description: "Spin 25 times in a session", icon: "🏆" },
  { id: "share", label: "Town Crier", description: "Share a spin on X", icon: "📣" },
] as const;

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
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function toNumber(v?: number | string): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = Number(String(v).replaceAll(",", ""));
  return Number.isFinite(n) ? n : undefined;
}

function timeAgo(ts?: number) {
  if (!ts) return "—";
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

function holdersArray(h: HoldersPayload): HolderRow[] {
  if (!h) return [];
  return Array.isArray(h) ? h : h.top10 ?? [];
}

function getDayKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
}

function getWeekKey(date = new Date()) {
  const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${temp.getUTCFullYear()}-W${weekNo}`;
}

function getSentimentEmoji(sentiment?: "bullish" | "bearish" | "neutral") {
  if (sentiment === "bullish") return "🚀";
  if (sentiment === "bearish") return "📉";
  return "😐";
}

function buildInsights(entry: SpinEntry | null, history: SpinEntry[]) {
  if (!entry) return [] as string[];
  const insights: string[] = [];
  const marketCap = toNumber(entry.coin.marketCap) ?? 0;
  const volume = toNumber(entry.coin.volume24h) ?? 0;
  const holders = toNumber(entry.coin.uniqueHolders) ?? 0;
  const change = entry.coin.change24h ?? 0;

  if (marketCap > 0) {
    if (marketCap > 500_000_000) insights.push("Major cap project with strong liquidity footprint.");
    else if (marketCap > 50_000_000) insights.push("Mid-cap play with room to grow.");
    else insights.push("Micro-cap degen territory — high risk, high reward.");
  }

  if (volume > marketCap * 0.4) insights.push("Volume is humming relative to market cap — potential breakout.");
  else if (volume < marketCap * 0.05) insights.push("Volume is thin right now. Expect volatility.");

  if (holders < 50) insights.push("Scarce supply with very few holders — any demand spike moves price fast.");
  else if (holders > 2000) insights.push("Large community of holders — momentum can sustain longer moves.");

  if (change) insights.push(`24h change sits at ${pct(change)}.`);

  const previous = history.slice(-3, -1).map((h) => h.coin);
  if (previous.length) {
    const prevAvgCap =
      previous.reduce((acc, c) => acc + (toNumber(c.marketCap) ?? 0), 0) / previous.length || 0;
    if (marketCap > prevAvgCap * 1.5) insights.push("Sharp uptick compared to recent spins — rotation to higher caps.");
  }

  if (entry.stats) {
    const { buyCount, sellCount, totalActivity } = entry.stats;
    if (buyCount > sellCount * 1.5) insights.push("Buy-side flow dominates the tape right now.");
    if (totalActivity === 0) insights.push("Quiet order books — consider waiting for confirmation.");
  }

  if (!insights.length) insights.push("Steady project with balanced stats. Keep it on the radar.");
  return insights;
}
export default function Home() {
  const [mode, setMode] = useState<Mode>("volume");
  const [filters, setFilters] = useState<Filters>(FILTER_DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SpinEntry | null>(null);
  const [history, setHistory] = useState<SpinEntry[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [spins, setSpins] = useState(0);
  const [uniqueStreak, setUniqueStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [log, setLog] = useState<LogLine[]>([{ t: "💫 Live terminal ready. Press SPIN.", type: "info" }]);
  const [toast, setToast] = useState<string | null>(null);
  const [mute, setMute] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [watchlist, setWatchlist] = useState<Record<string, Coin>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardState>({
    dailyKey: getDayKey(),
    weeklyKey: getWeekKey(),
    dailyTopStreak: 0,
    weeklyTopStreak: 0,
    rareFinds: 0,
    bestStreak: 0,
    totalSpins: 0,
  });
  const [achievementState, setAchievementState] = useState<AchievementRecord>({});
  const [showDetailsSheet, setShowDetailsSheet] = useState(false);
  const [sessionReplaying, setSessionReplaying] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);

  const wheelRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const confettiTimeout = useRef<number | null>(null);
  const replayTimeout = useRef<number | null>(null);
  const replayIndex = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedHistory = window.localStorage.getItem(STORAGE_KEYS.history);
      if (storedHistory) {
        const parsed = JSON.parse(storedHistory) as SpinEntry[];
        setHistory(parsed.slice(-MAX_HISTORY));
        if (parsed.length) {
          const last = parsed[parsed.length - 1];
          setData(last);
          setSelectedHistoryId(last.id);
        }
      }
    } catch {
      // ignore
    }

    try {
      const storedFavorites = window.localStorage.getItem(STORAGE_KEYS.favorites);
      if (storedFavorites) setFavorites(JSON.parse(storedFavorites));
    } catch {
      // ignore
    }

    try {
      const storedTheme = window.localStorage.getItem(STORAGE_KEYS.theme) as "dark" | "light" | null;
      if (storedTheme) setTheme(storedTheme);
    } catch {
      // ignore
    }

    try {
      const storedMute = window.localStorage.getItem(STORAGE_KEYS.mute);
      if (storedMute) setMute(storedMute === "true");
    } catch {
      // ignore
    }

    try {
      const storedWatchlist = window.localStorage.getItem(STORAGE_KEYS.watchlist);
      if (storedWatchlist) setWatchlist(JSON.parse(storedWatchlist));
    } catch {
      // ignore
    }

    try {
      const storedLeaderboard = window.localStorage.getItem(STORAGE_KEYS.leaderboard);
      if (storedLeaderboard) {
        const parsed = JSON.parse(storedLeaderboard) as LeaderboardState;
        setLeaderboard(parsed);
      }
    } catch {
      // ignore
    }

    try {
      const storedAchievements = window.localStorage.getItem(STORAGE_KEYS.achievements);
      if (storedAchievements) setAchievementState(JSON.parse(storedAchievements));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.mute, mute ? "true" : "false");
  }, [mute]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.watchlist, JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.leaderboard, JSON.stringify(leaderboard));
  }, [leaderboard]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.achievements, JSON.stringify(achievementState));
  }, [achievementState]);

  useEffect(() => {
    if (!containerRef.current) return;
    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      const deltaY = (e.changedTouches[0]?.clientY ?? 0) - touchStartY;
      if (deltaY < -120) {
        void spin();
      }
    };
    const el = containerRef.current;
    el.addEventListener("touchstart", handleTouchStart);
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  });

  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [log]);

  const insights = useMemo(() => buildInsights(data, history), [data, history]);

  function pushLog(line: LogLine) {
    setLog((prev) => [...prev.slice(-400), line]);
  }

  function ensureAudioContext() {
    if (typeof window === "undefined") return null;
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = Ctx ? new Ctx() : null;
    }
    return audioContextRef.current;
  }

  function playTone(type: "spin" | "rare" | "milestone" | "win") {
    if (mute) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    const now = ctx.currentTime;

    if (type === "spin") {
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.4);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } else if (type === "rare") {
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(990, now + 0.3);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    } else if (type === "milestone") {
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.setValueAtTime(550, now + 0.2);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } else {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.7);
  }

  function updateConfetti(enabled: boolean) {
    if (confettiTimeout.current) {
      window.clearTimeout(confettiTimeout.current);
      confettiTimeout.current = null;
    }
    setConfetti(enabled);
    if (enabled) {
      confettiTimeout.current = window.setTimeout(() => setConfetti(false), 1800);
    }
  }

  function updateLeaderboard(rare: boolean, newStreak: number, potentialBest: number) {
    const now = new Date();
    setLeaderboard((prev) => {
      const next: LeaderboardState = { ...prev };
      const dayKey = getDayKey(now);
      const weekKey = getWeekKey(now);
      if (next.dailyKey !== dayKey) {
        next.dailyKey = dayKey;
        next.dailyTopStreak = 0;
      }
      if (next.weeklyKey !== weekKey) {
        next.weeklyKey = weekKey;
        next.weeklyTopStreak = 0;
      }
      next.totalSpins += 1;
      if (newStreak > next.dailyTopStreak) next.dailyTopStreak = newStreak;
      if (newStreak > next.weeklyTopStreak) next.weeklyTopStreak = newStreak;
      if (rare) next.rareFinds += 1;
      if (potentialBest > next.bestStreak) next.bestStreak = potentialBest;
      return next;
    });
  }

  function unlockAchievement(id: string) {
    setAchievementState((prev) => {
      if (prev[id]) return prev;
      return { ...prev, [id]: true };
    });
  }
  async function spin() {
    if (loading) return;
    try {
      setLoading(true);
      wheelRef.current?.classList.remove("animate-spin-fancy");
      void wheelRef.current?.offsetHeight;
      wheelRef.current?.classList.add("animate-spin-fancy");
      playTone("spin");
      pushLog({ t: `[${new Date().toLocaleTimeString("en-US", { hour12: false })}] 🎰 Spinning…`, type: "info" });
      const capLow = Math.min(filters.marketCap[0], filters.marketCap[1]);
      const capHigh = Math.max(filters.marketCap[0], filters.marketCap[1]);
      const holdersLow = Math.min(filters.holders[0], filters.holders[1]);
      const holdersHigh = Math.max(filters.holders[0], filters.holders[1]);

      const params = new URLSearchParams({ mode });
      params.set("marketCapMin", String(capLow));
      params.set("marketCapMax", String(capHigh));
      params.set("holdersMin", String(holdersLow));
      params.set("holdersMax", String(holdersHigh));
      params.set("volumeMin", String(filters.volumeMin));

      const response = await fetch(`/api/spin?${params.toString()}`, { cache: "no-store" });
      const payload: SpinResp = await response.json();

      if (!payload.ok || !payload.coin) {
        pushLog({ t: `⚠ spin failed: ${payload.error ?? "unexpected-error"}`, type: "warn" });
        setToast("Spin failed. Try again");
        setTimeout(() => setToast(null), 1800);
        return;
      }

      const entry: SpinEntry = {
        id: `${payload.coin.address ?? "unknown"}-${Date.now()}`,
        timestamp: Date.now(),
        coin: payload.coin,
        details: payload.details,
        stats: payload.stats,
        favorite: favorites.includes(payload.coin.address ?? ""),
      };

      setData(entry);
      setSelectedHistoryId(entry.id);
      setHistory((prev) => [...prev.slice(-(MAX_HISTORY - 1)), entry]);
      setSpins((prev) => prev + 1);
      setShowDetailsSheet(true);

      const duplicate = history.some((h) => h.coin.address && h.coin.address === entry.coin.address);
      const holders = toNumber(entry.coin.uniqueHolders) ?? 0;
      const isRare = holders > 0 && holders < 50;
      const isPopular = holders >= 1000;
      const sentimentEmoji = getSentimentEmoji(entry.stats?.sentiment);
      const rarityBadge = isRare ? "💎" : isPopular ? "🔥" : "";
      const prospectiveBest = entry.coin.address && !duplicate ? Math.max(bestStreak, uniqueStreak + 1) : bestStreak;
      const watchlistedHit = entry.coin.address ? Boolean(watchlist[entry.coin.address]) : false;

      pushLog({
        t: `✔ ${sentimentEmoji} ${rarityBadge} ${entry.coin.name}${entry.coin.symbol ? ` (${entry.coin.symbol})` : ""} — cap:${compact(entry.coin.marketCap)} vol24h:${compact(entry.coin.volume24h)} holders:${compact(entry.coin.uniqueHolders)}${duplicate ? " 🔁" : ""}`,
        type: "ok",
      });

      if (entry.coin.address) {
        pushLog({ t: `↳ https://zora.co/coin/${entry.coin.address}`, type: "info" });
      }

      if (entry.stats) {
        pushLog({
          t: `↳ sentiment: ${entry.stats.sentiment} ${sentimentEmoji} • buys ${entry.stats.buyCount} / sells ${entry.stats.sellCount}`,
          type: "info",
        });
      }

      if (duplicate) {
        setToast("🔁 Seen this coin before");
      } else if (isRare) {
        setToast("💎 Rare gem!");
        updateConfetti(true);
        playTone("rare");
      } else if (isPopular) {
        setToast("🔥 Popular coin spotted");
        playTone("win");
      } else if (watchlistedHit) {
        setToast("🔔 Watchlist hit!");
      } else {
        setToast("✅ Fresh spin!");
      }
      setTimeout(() => setToast(null), 2400);

      if (entry.coin.address && !duplicate) {
        const updated = uniqueStreak + 1;
        setUniqueStreak(updated);
        if (updated > bestStreak) {
          setBestStreak(updated);
        }
        if (updated && updated % 5 === 0) {
          playTone("milestone");
        }
        updateLeaderboard(isRare, updated, prospectiveBest);
      } else {
        setUniqueStreak(0);
        updateLeaderboard(isRare, 0, prospectiveBest);
      }

      if (isRare) {
        unlockAchievement("lucky-rare");
      }
      if (spins + 1 === 1) unlockAchievement("first-spin");
      if (spins + 1 >= 25) unlockAchievement("spins-25");
      if (prospectiveBest >= 5) unlockAchievement("streak-5");
      if (prospectiveBest >= 10) unlockAchievement("streak-10");

      const isFavorited = favorites.includes(entry.coin.address ?? "");
      if (isFavorited) {
        setHistory((prev) => prev.map((item) => (item.id === entry.id ? { ...item, favorite: true } : item)));
      }
    } catch (error) {
      console.error(error);
      pushLog({ t: `⚠ spin failed: ${(error as Error).message}`, type: "warn" });
      setToast("Spin failed");
      setTimeout(() => setToast(null), 1800);
    } finally {
      setLoading(false);
    }
  }

  function handleHistorySelect(entry: SpinEntry) {
    setData(entry);
    setSelectedHistoryId(entry.id);
    setShowDetailsSheet(true);
  }

  function toggleFavorite(entry: SpinEntry) {
    const address = entry.coin.address ?? "";
    if (!address) return;
    setFavorites((prev) => {
      const exists = prev.includes(address);
      return exists ? prev.filter((f) => f !== address) : [...prev, address];
    });
    setHistory((prev) => prev.map((item) => (item.id === entry.id ? { ...item, favorite: !item.favorite } : item)));
  }

  function toggleWatchlistEntry(coin: Coin) {
    const address = coin.address;
    if (!address) return;
    setWatchlist((prev) => {
      const next = { ...prev };
      if (next[address]) {
        delete next[address];
      } else {
        next[address] = coin;
      }
      return next;
    });
  }

  function shareOnX(entry: SpinEntry | null) {
    if (!entry?.coin.address) return;
    const sentimentEmoji = getSentimentEmoji(entry.stats?.sentiment);
    const text = `Just found ${entry.coin.name}${entry.coin.symbol ? ` (${entry.coin.symbol})` : ""} on @zora 🎰 ${sentimentEmoji} Streak: ${uniqueStreak}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`https://zora.co/coin/${entry.coin.address}`)}`;
    window.open(url, "_blank");
    unlockAchievement("share");
  }

  async function copyShareSummary(entry: SpinEntry | null) {
    if (!entry) return;
    const summary = `🎰 Zora Roulette Spin #${spins}\n${entry.coin.name} ${entry.coin.symbol ? `($${entry.coin.symbol})` : ""}\nMarket cap: ${compact(entry.coin.marketCap)}\n24h Volume: ${compact(entry.coin.volume24h)}\nHolders: ${compact(entry.coin.uniqueHolders)}\nStreak: ${uniqueStreak}`;
    try {
      await navigator.clipboard.writeText(summary);
      setToast("Copied session summary!");
    } catch {
      setToast("Clipboard unavailable");
    }
    setTimeout(() => setToast(null), 1600);
  }

  async function generateScreenshot() {
    if (typeof window === "undefined") return;
    const element = containerRef.current;
    if (!element) return;
    try {
      if (!(window as unknown as { html2canvas?: unknown }).html2canvas) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load html2canvas"));
          document.body.appendChild(script);
        });
      }
      const html2canvasGlobal = (window as unknown as {
        html2canvas?: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
      }).html2canvas;
      if (!html2canvasGlobal) {
        throw new Error("html2canvas unavailable");
      }
      const canvas = await html2canvasGlobal(element, {
        backgroundColor: theme === "dark" ? "#09090b" : "#fafafa",
      });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `zora-roulette-${Date.now()}.png`;
      link.click();
      setToast("📸 Screenshot saved");
    } catch {
      setToast("Screenshot failed. Try desktop browser.");
    }
    setTimeout(() => setToast(null), 1800);
  }

  function startSessionReplay() {
    if (!history.length) return;
    setSessionReplaying(true);
    replayIndex.current = 0;
    const playNext = () => {
      const entry = history[replayIndex.current];
      if (!entry) {
        setSessionReplaying(false);
        return;
      }
      setData(entry);
      setSelectedHistoryId(entry.id);
      replayIndex.current += 1;
      replayTimeout.current = window.setTimeout(playNext, 1500);
    };
    playNext();
  }

  function stopSessionReplay() {
    setSessionReplaying(false);
    if (replayTimeout.current) {
      window.clearTimeout(replayTimeout.current);
      replayTimeout.current = null;
    }
  }

  useEffect(() => () => {
    if (confettiTimeout.current) window.clearTimeout(confettiTimeout.current);
    if (replayTimeout.current) window.clearTimeout(replayTimeout.current);
  }, []);

  const comparisonCoins = useMemo(() => history.slice(-3).reverse(), [history]);
  const holdersTop10: HolderRow[] = useMemo(() => holdersArray(data?.details?.holders).slice(0, 10), [data]);
  const swapsTop10: SwapUI[] = useMemo(
    () =>
      Array.isArray(data?.details?.swaps)
        ? (data?.details?.swaps as SwapUI[]).slice(0, 10)
        : [],
    [data]
  );
  const commentsTop: CommentUI[] = useMemo(
    () =>
      Array.isArray(data?.details?.comments)
        ? (data?.details?.comments as CommentUI[]).slice(0, 6)
        : [],
    [data]
  );

  const currentAddress = data?.coin.address ?? "";
  const inWatchlist = currentAddress ? Boolean(watchlist[currentAddress]) : false;
  return (
    <main
      ref={containerRef}
      className={`min-h-screen transition-colors duration-500 ${
        theme === "dark" ? "bg-zinc-950 text-zinc-100" : "bg-zinc-100 text-zinc-900"
      }`}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        {/* History sidebar */}
        <aside className="rounded-2xl border border-zinc-800/50 bg-black/20 p-4 shadow-lg backdrop-blur lg:sticky lg:top-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Spins</h2>
            <button
              onClick={() => {
                setFavorites([]);
                setHistory((prev) => prev.map((item) => ({ ...item, favorite: false })));
              }}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Clear ⭐
            </button>
          </div>
          <div className="space-y-3">
            {history.length === 0 && <p className="text-sm text-zinc-400">Spin the wheel to populate history.</p>}
            {history.map((entry) => {
              const isSelected = selectedHistoryId === entry.id;
              const rare = (toNumber(entry.coin.uniqueHolders) ?? 0) < 50 && (toNumber(entry.coin.uniqueHolders) ?? 0) > 0;
              const watchlisted = entry.coin.address ? Boolean(watchlist[entry.coin.address]) : false;
              return (
                <div
                  key={entry.id}
                  className={`group rounded-xl border p-3 transition-colors ${
                    isSelected ? "border-emerald-400/80 bg-emerald-500/10" : "border-zinc-800/60 bg-black/10 hover:border-zinc-600"
                  }`}
                >
                  <button
                    className="flex w-full items-start gap-3 text-left"
                    onClick={() => handleHistorySelect(entry)}
                  >
                    <span className="mt-1 text-xl">{rare ? "💎" : "🪙"}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">{entry.coin.name}</div>
                        <div className="text-xs text-zinc-400">{timeAgo(entry.timestamp)}</div>
                      </div>
                      <div className="text-xs text-zinc-400 flex items-center gap-2">
                        <span>
                          {compact(entry.coin.marketCap)} cap • {compact(entry.coin.volume24h)} vol
                        </span>
                        {watchlisted && <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-200">Watchlist</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] uppercase tracking-wide">
                          {entry.stats?.sentiment ?? "neutral"}
                        </span>
                        {entry.coin.symbol && <span className="text-zinc-400">{entry.coin.symbol}</span>}
                      </div>
                    </div>
                  </button>
                  <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
                    <button
                      onClick={() => toggleFavorite(entry)}
                      className={`transition ${entry.favorite ? "text-yellow-300" : "hover:text-yellow-200"}`}
                    >
                      {entry.favorite ? "⭐ Favorited" : "☆ Favorite"}
                    </button>
                    <button onClick={() => shareOnX(entry)} className="hover:text-sky-400">
                      Share on X
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-zinc-800/70 bg-black/30 p-3 text-xs text-zinc-400">
            <span>Mute sound</span>
            <button
              onClick={() => setMute((m) => !m)}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                mute ? "bg-zinc-700 text-zinc-200" : "bg-emerald-500/20 text-emerald-300"
              }`}
            >
              {mute ? "Off" : "On"}
            </button>
          </div>
        </aside>

        <section className="space-y-6">
          <header className="rounded-3xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 via-black/60 to-emerald-900/20 p-6 shadow-xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">🎰 Zora Roulette</h1>
                <p className="text-sm text-zinc-400">Spin the wheel, explore coins, track streaks and share with frens.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="rounded-full border border-zinc-700/70 bg-black/30 px-4 py-2 text-sm text-zinc-300 transition hover:border-emerald-400/60"
                >
                  {theme === "dark" ? "🌞 Light" : "🌚 Dark"}
                </button>
                <button
                  onClick={() => copyShareSummary(data)}
                  className="rounded-full border border-zinc-700/70 bg-black/40 px-4 py-2 text-sm text-zinc-300 transition hover:border-sky-400/60"
                >
                  📋 Copy Summary
                </button>
                <button
                  onClick={generateScreenshot}
                  className="rounded-full border border-zinc-700/70 bg-black/40 px-4 py-2 text-sm text-zinc-300 transition hover:border-purple-400/60"
                >
                  📸 Screenshot
                </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div className="rounded-2xl border border-zinc-800/70 bg-black/30 p-3">
                <div className="text-xs uppercase text-zinc-500">Spins</div>
                <div className="text-2xl font-semibold">{spins}</div>
              </div>
              <div className="rounded-2xl border border-zinc-800/70 bg-black/30 p-3">
                <div className="text-xs uppercase text-zinc-500">Unique Streak</div>
                <div className="text-2xl font-semibold">{uniqueStreak}</div>
              </div>
              <div className="rounded-2xl border border-zinc-800/70 bg-black/30 p-3">
                <div className="text-xs uppercase text-zinc-500">Best Streak</div>
                <div className="text-2xl font-semibold">{bestStreak}</div>
              </div>
              <div className="rounded-2xl border border-zinc-800/70 bg-black/30 p-3">
                <div className="text-xs uppercase text-zinc-500">Rare finds</div>
                <div className="text-2xl font-semibold">{leaderboard.rareFinds}</div>
              </div>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <div className="relative flex flex-col items-center justify-center rounded-3xl border border-zinc-800/60 bg-black/30 p-6 shadow-lg">
                <div ref={wheelRef} className="roulette-wheel">
                  <div className="roulette-core">
                    <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">Mode</div>
                    <div className="text-xl font-semibold text-emerald-300">
                      {mode === "volume" && "📊 Volume"}
                      {mode === "trending" && "🔥 Trending"}
                      {mode === "new" && "✨ New"}
                    </div>
                    <div className="mt-2 text-xs text-zinc-400">Spins: {spins}</div>
                    {uniqueStreak >= 5 && (
                      <div className="mt-1 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">
                        🔥 Streak {uniqueStreak}
                      </div>
                    )}
                  </div>
                  <div className="roulette-pointer" />
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  {(["volume", "trending", "new"] as Mode[]).map((value) => (
                    <button
                      key={value}
                      onClick={() => setMode(value)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        mode === value ? "bg-emerald-500 text-emerald-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      {value === "volume" && "📊 Volume"}
                      {value === "trending" && "🔥 Trending"}
                      {value === "new" && "✨ New"}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={spin}
                    disabled={loading}
                    className={`rounded-full px-6 py-3 text-base font-semibold transition ${
                      loading ? "bg-emerald-400/40 text-emerald-200" : "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                    }`}
                  >
                    {loading ? "Spinning…" : "Spin"}
                  </button>
                  <button
                    onClick={() => shareOnX(data)}
                    className="rounded-full border border-sky-500/50 px-5 py-2 text-sm text-sky-300 transition hover:bg-sky-500/20"
                  >
                    Share on X (Twitter)
                  </button>
                  <button
                    onClick={sessionReplaying ? stopSessionReplay : startSessionReplay}
                    className="rounded-full border border-zinc-700/70 px-5 py-2 text-sm text-zinc-300 transition hover:border-purple-400/60"
                  >
                    {sessionReplaying ? "Stop Replay" : "Replay Session"}
                  </button>
                </div>
              </div>
              <section className="rounded-3xl border border-zinc-800/60 bg-black/30 p-6">
                <h2 className="text-lg font-semibold">Advanced Filters</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase text-zinc-500">Market Cap Range</label>
                    <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                      <span>${compact(filters.marketCap[0])}</span>
                      <input
                        type="range"
                        min={0}
                        max={1_000_000_000}
                        step={1_000_000}
                        value={filters.marketCap[0]}
                        onChange={(e) =>
                          setFilters((prev) => ({ ...prev, marketCap: [Number(e.target.value), prev.marketCap[1]] }))
                        }
                        className="flex-1"
                      />
                      <input
                        type="range"
                        min={0}
                        max={1_000_000_000}
                        step={1_000_000}
                        value={filters.marketCap[1]}
                        onChange={(e) =>
                          setFilters((prev) => ({ ...prev, marketCap: [prev.marketCap[0], Number(e.target.value)] }))
                        }
                        className="flex-1"
                      />
                      <span>${compact(filters.marketCap[1])}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-zinc-500">Holder Count</label>
                    <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                      <input
                        type="number"
                        value={filters.holders[0]}
                        onChange={(e) => setFilters((prev) => ({ ...prev, holders: [Number(e.target.value), prev.holders[1]] }))}
                        className="w-20 rounded border border-zinc-700 bg-black/30 px-2 py-1"
                      />
                      <span>to</span>
                      <input
                        type="number"
                        value={filters.holders[1]}
                        onChange={(e) => setFilters((prev) => ({ ...prev, holders: [prev.holders[0], Number(e.target.value)] }))}
                        className="w-20 rounded border border-zinc-700 bg-black/30 px-2 py-1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-zinc-500">Volume Threshold</label>
                    <input
                      type="number"
                      value={filters.volumeMin}
                      onChange={(e) => setFilters((prev) => ({ ...prev, volumeMin: Number(e.target.value) }))}
                      className="mt-2 w-full rounded border border-zinc-700 bg-black/30 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800/60 bg-black/30 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Coin Comparison</h2>
                  <span className="text-xs text-zinc-400">Last {comparisonCoins.length} spins</span>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {comparisonCoins.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-zinc-800/70 bg-black/20 p-4 text-sm">
                      <div className="flex items-center justify-between text-xs text-zinc-400">
                        <span>{timeAgo(entry.timestamp)}</span>
                        <span>{entry.coin.symbol}</span>
                      </div>
                      <div className="mt-2 text-base font-semibold">{entry.coin.name}</div>
                      <div className="mt-3 space-y-2 text-xs text-zinc-400">
                        <div>Cap: {compact(entry.coin.marketCap)}</div>
                        <div>Vol: {compact(entry.coin.volume24h)}</div>
                        <div>Holders: {compact(entry.coin.uniqueHolders)}</div>
                      </div>
                    </div>
                  ))}
                  {!comparisonCoins.length && <p className="text-sm text-zinc-400">Spin a few times to compare coins.</p>}
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800/60 bg-black/30 p-6">
                <h2 className="text-lg font-semibold">AI Insights</h2>
                <div className="mt-3 space-y-2 text-sm text-zinc-300">
                  {insights.map((insight, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span>🤖</span>
                      <p>{insight}</p>
                    </div>
                  ))}
                  {!insights.length && <p className="text-sm text-zinc-400">Spin to unlock insights.</p>}
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800/60 bg-black/30 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Terminal Log</h2>
                  <button
                    onClick={() => setLog([{ t: "🧹 Log cleared.", type: "info" }])}
                    className="text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Clear
                  </button>
                </div>
                <div ref={termRef} className="mt-4 h-56 overflow-y-auto rounded-2xl border border-zinc-800/70 bg-black/50 p-3 text-xs">
                  <div className="space-y-1 font-mono">
                    {log.map((line, idx) => (
                      <div
                        key={idx}
                        className={
                          line.type === "warn" ? "text-amber-300" : line.type === "ok" ? "text-emerald-300" : "text-zinc-400"
                        }
                      >
                        {line.t}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-3xl border border-zinc-800/60 bg-black/30 p-6">
                <h2 className="text-lg font-semibold">Coin Details</h2>
                {data ? (
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-base font-semibold">{data.coin.name}</div>
                      <button
                        onClick={() => toggleWatchlistEntry(data.coin)}
                        className={`text-xs ${inWatchlist ? "text-emerald-300" : "text-zinc-400 hover:text-emerald-300"}`}
                      >
                        {inWatchlist ? "In Watchlist" : "Add to Watchlist"}
                      </button>
                    </div>
                    {data.coin.symbol && <div className="text-xs uppercase text-zinc-400">{data.coin.symbol}</div>}
                    {data.coin.address && (
                      <a
                        className="text-xs text-sky-400 hover:underline"
                        href={`https://zora.co/coin/${data.coin.address}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View on Zora ↗
                      </a>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-xs text-zinc-400">
                      <div>
                        <div className="text-[11px] uppercase">Market Cap</div>
                        <div className="text-sm text-zinc-200">{compact(data.coin.marketCap)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase">24h Volume</div>
                        <div className="text-sm text-zinc-200">{compact(data.coin.volume24h)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase">Holders</div>
                        <div className="text-sm text-zinc-200">{compact(data.coin.uniqueHolders)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase">24h Change</div>
                        <div className={`text-sm ${data.coin.change24h && data.coin.change24h > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {pct(data.coin.change24h)}
                        </div>
                      </div>
                    </div>
                    {data.stats && (
                      <div className="rounded-2xl border border-zinc-800/60 bg-black/40 p-3 text-xs text-zinc-300">
                        <div>Sentiment: {data.stats.sentiment} {getSentimentEmoji(data.stats.sentiment)}</div>
                        <div>Activity: {data.stats.totalActivity} • Buys {data.stats.buyCount} / Sells {data.stats.sellCount}</div>
                      </div>
                    )}
                    <div className="rounded-2xl border border-zinc-800/60 bg-black/40 p-3 text-xs text-zinc-300">
                      <div className="text-[11px] uppercase text-zinc-500">AI Prediction</div>
                      <div>
                        {data.stats?.sentiment === "bullish"
                          ? "Momentum building — expect buyers to defend dips."
                          : data.stats?.sentiment === "bearish"
                          ? "Supply heavy — watch for capitulation before jumping in."
                          : "Neutral chop — wait for the next catalyst."}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-zinc-400">Spin the wheel to load coin data.</p>
                )}
              </section>

              <section className="rounded-3xl border border-zinc-800/60 bg-black/30 p-6">
                <h2 className="text-lg font-semibold">Watchlist</h2>
                <div className="mt-3 space-y-2 text-sm text-zinc-300">
                  {Object.values(watchlist).map((coin) => (
                    <div key={coin.address} className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-black/20 p-3">
                      <div>
                        <div className="font-semibold">{coin.name}</div>
                        <div className="text-xs text-zinc-400">{coin.symbol}</div>
                      </div>
                      <button onClick={() => toggleWatchlistEntry(coin)} className="text-xs text-rose-300">
                        Remove
                      </button>
                    </div>
                  ))}
                  {!Object.keys(watchlist).length && <p className="text-xs text-zinc-500">Add coins to your watchlist from the details panel.</p>}
                </div>
              </section>
              <section className="rounded-3xl border border-zinc-800/60 bg-black/30 p-6">
                <h2 className="text-lg font-semibold">Leaderboard</h2>
                <div className="mt-3 space-y-2 text-sm text-zinc-300">
                  <div className="rounded-2xl border border-zinc-800/60 bg-black/30 p-3">
                    <div className="text-xs uppercase text-zinc-500">Daily Top Streak</div>
                    <div className="text-lg font-semibold text-emerald-300">{leaderboard.dailyTopStreak}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-800/60 bg-black/30 p-3">
                    <div className="text-xs uppercase text-zinc-500">Weekly Top Streak</div>
                    <div className="text-lg font-semibold text-emerald-300">{leaderboard.weeklyTopStreak}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-800/60 bg-black/30 p-3">
                    <div className="text-xs uppercase text-zinc-500">Total Spins</div>
                    <div className="text-lg font-semibold">{leaderboard.totalSpins}</div>
                  </div>
                  <button
                    onClick={() => shareOnX(data)}
                    className="w-full rounded-full border border-sky-500/50 px-4 py-2 text-xs text-sky-300 transition hover:bg-sky-500/20"
                  >
                    Share streak to X
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800/60 bg-black/30 p-6">
                <h2 className="text-lg font-semibold">Achievements</h2>
                <div className="mt-3 space-y-2 text-sm text-zinc-300">
                  {ACHIEVEMENT_DEFS.map((ach) => {
                    const unlocked = achievementState[ach.id];
                    return (
                      <div
                        key={ach.id}
                        className={`flex items-start gap-3 rounded-2xl border border-zinc-800/60 p-3 ${
                          unlocked ? "bg-emerald-500/10 text-emerald-200" : "bg-black/30 text-zinc-400"
                        }`}
                      >
                        <div className="text-xl">{ach.icon}</div>
                        <div>
                          <div className="text-sm font-semibold">{ach.label}</div>
                          <div className="text-xs">{ach.description}</div>
                        </div>
                        <div className="ml-auto text-xs">{unlocked ? "Unlocked" : "Locked"}</div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800/60 bg-black/30 p-6">
                <h2 className="text-lg font-semibold">Recent Swaps</h2>
                <div className="mt-3 space-y-2 text-xs text-zinc-300">
                  {swapsTop10.map((swap, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-black/20 p-3">
                      <div>
                        <div className="text-sm font-semibold">{swap.side}</div>
                        <div className="text-xs text-zinc-400">{swap.date} • {swap.time}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div>{swap.amount}</div>
                        <div className="text-xs text-zinc-500">{swap.address}</div>
                      </div>
                    </div>
                  ))}
                  {!swapsTop10.length && <p className="text-xs text-zinc-500">No swaps logged yet.</p>}
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800/60 bg-black/30 p-6">
                <h2 className="text-lg font-semibold">Top Holders</h2>
                <div className="mt-3 space-y-2 text-xs text-zinc-300">
                  {holdersTop10.map((holder) => (
                    <div key={holder.rank} className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-black/20 p-3">
                      <div>
                        <div className="text-sm font-semibold">#{holder.rank} {holder.holder}</div>
                        <div className="text-xs text-zinc-500">{holder.percentage?.toFixed(1)}%</div>
                      </div>
                      <div className="text-sm">{compact(holder.balance)}</div>
                    </div>
                  ))}
                  {!holdersTop10.length && <p className="text-xs text-zinc-500">No holder data yet.</p>}
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800/60 bg-black/30 p-6">
                <h2 className="text-lg font-semibold">Community Sentiment</h2>
                <div className="mt-3 space-y-2 text-xs text-zinc-300">
                  {commentsTop.map((comment, idx) => (
                    <div key={idx} className="rounded-xl border border-zinc-800/60 bg-black/20 p-3">
                      <div className="text-sm font-semibold">{comment.author ?? comment.user ?? "anon"}</div>
                      <div className="text-xs text-zinc-400">{comment.date ?? comment.ts ?? ""}</div>
                      <p className="mt-1 text-sm">{comment.text}</p>
                    </div>
                  ))}
                  {!commentsTop.length && <p className="text-xs text-zinc-500">Spin again to fetch commentary.</p>}
                </div>
              </section>
            </aside>
          </div>
        </section>

        <aside className="hidden flex-col gap-4 rounded-2xl border border-zinc-800/60 bg-black/30 p-4 text-sm text-zinc-300 lg:flex">
          <div>
            <h2 className="text-lg font-semibold">Gamification</h2>
            <p className="text-xs text-zinc-500">Daily bonus resets every 24h. Spin daily for extra streak multipliers.</p>
          </div>
          <div className="rounded-xl border border-zinc-800/60 bg-black/40 p-3">
            <div className="text-xs uppercase text-zinc-500">Daily Bonus</div>
            <div className="text-xl font-semibold text-emerald-300">+1 spin</div>
            <p className="text-xs text-zinc-500">Claimed automatically on your first spin of the day.</p>
          </div>
          <div className="rounded-xl border border-zinc-800/60 bg-black/40 p-3">
            <div className="text-xs uppercase text-zinc-500">Streak Rewards</div>
            <ul className="mt-2 space-y-1 text-xs">
              <li>🔥 5 streak — confetti + sound</li>
              <li>⚡ 10 streak — bonus leaderboard shoutout</li>
              <li>🏆 20 streak — hall of fame slot</li>
            </ul>
          </div>
          <div className="rounded-xl border border-zinc-800/60 bg-black/40 p-3">
            <div className="text-xs uppercase text-zinc-500">Portfolio Alerts</div>
            <p className="text-xs text-zinc-500">Watchlisted coins will highlight in history when spun again.</p>
          </div>
          <div className="rounded-xl border border-zinc-800/60 bg-black/40 p-3">
            <div className="text-xs uppercase text-zinc-500">Export & Save</div>
            <button onClick={generateScreenshot} className="mt-2 w-full rounded-full border border-purple-400/60 px-4 py-2 text-xs text-purple-200 hover:bg-purple-500/20">
              Save Screenshot
            </button>
            <button onClick={sessionReplaying ? stopSessionReplay : startSessionReplay} className="mt-2 w-full rounded-full border border-zinc-700/60 px-4 py-2 text-xs text-zinc-300 hover:border-emerald-400/60">
              {sessionReplaying ? "Stop Replay" : "Session Replay"}
            </button>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="fixed left-1/2 top-6 z-40 -translate-x-1/2 rounded-full border border-emerald-400/60 bg-black/70 px-6 py-3 text-sm text-emerald-200 shadow-lg">
          {toast}
        </div>
      )}

      {confetti && (
        <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
          {Array.from({ length: 40 }).map((_, idx) => (
            <span key={idx} className="confetti" style={{ ['--i' as const]: idx }} />
          ))}
        </div>
      )}

      <div
        className={`fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-800/60 bg-black/80 p-4 text-sm text-zinc-200 shadow-2xl transition-transform duration-300 lg:hidden ${
          showDetailsSheet ? "translate-y-0" : "translate-y-[80%]"
        }`}
      >
        <div className="mx-auto max-w-3xl">
          <button className="mb-2 flex w-full items-center justify-between" onClick={() => setShowDetailsSheet((v) => !v)}>
            <span className="text-xs uppercase text-zinc-500">Details</span>
            <span>{showDetailsSheet ? "▼" : "▲"}</span>
          </button>
          {data ? (
            <div className="space-y-2 text-xs">
              <div className="text-sm font-semibold">{data.coin.name}</div>
              <div>Market cap: {compact(data.coin.marketCap)}</div>
              <div>Volume: {compact(data.coin.volume24h)}</div>
              <div>Holders: {compact(data.coin.uniqueHolders)}</div>
              <div>Sentiment: {data.stats?.sentiment} {getSentimentEmoji(data.stats?.sentiment)}</div>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Spin the wheel to load coin data.</p>
          )}
        </div>
      </div>
    </main>
  );
}
