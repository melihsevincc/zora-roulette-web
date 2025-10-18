import { NextResponse } from "next/server";
import {
  setApiKey,
  getCoinsTopVolume24h,
  getCoin,
  getCoinSwaps,
  getCoinComments,
  getCoinHolders,
} from "@zoralabs/coins-sdk";
import { base } from "viem/chains";
import { formatUnits } from "viem";
import type {
  Coin,
  CoinRaw,
  ExploreEdgeRaw,
} from "@/lib/types";

setApiKey(process.env.ZORA_API_KEY || "");
export const dynamic = "force-dynamic";

// Type definitions
interface SwapNode {
  activityType?: string;
  coinAmount?: string | number | bigint;
  amount?: string | number | bigint;
  usdValue?: string | number;
  coinUsdValue?: string | number;
  blockTimestamp?: string | number;
  timestamp?: string | number;
  createdAt?: string | number;
  time?: string | number;
}

interface HolderNode {
  ownerProfile?: { handle?: string };
  owner?: { handle?: string };
  ownerAddress?: string;
  address?: string;
  balance?: string | number | bigint;
  formattedBalance?: string | number | bigint;
}

interface CommentNode {
  userProfile?: { handle?: string };
  user?: { handle?: string };
  userAddress?: string;
  comment?: string;
  text?: string;
  timestamp?: string | number;
  createdAt?: string | number;
  time?: string | number;
}

interface EdgeWrapper<T> {
  node?: T;
}

interface ApiResponse {
  data?: {
    zora20Token?: {
      decimals?: number;
      swapActivities?: { edges?: EdgeWrapper<SwapNode>[] };
      zoraComments?: { edges?: EdgeWrapper<CommentNode>[] };
      tokenBalances?: { edges?: EdgeWrapper<HolderNode>[] };
      totalSupply?: string | number;
      supply?: string | number;
    };
  };
}

interface ProcessedSwap {
  index: number;
  side: 'BUY' | 'SELL';
  amount: number;
  usdValue: number | null;
  date: string;
  time: string;
  timestamp: number | null;
}

interface ProcessedHolder {
  rank: number;
  holder: string;
  balance: number;
  percentage: number;
}

interface ProcessedComment {
  author: string;
  text: string;
  date: string;
  timestamp: number | null;
}

// Utils
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function take<T>(arr: T[], n: number): T[] {
  return arr.slice(0, Math.max(0, Math.min(n, arr.length)));
}

const toNum = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/_/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

function normalizeCoin(raw: CoinRaw): Coin {
  return {
    address: raw.address,
    name: raw.name,
    symbol: raw.symbol,
    marketCap: toNum(raw.marketCap),
    volume24h: toNum(raw.volume24h),
    uniqueHolders: toNum(raw.uniqueHolders),
    marketCapDelta24h: toNum(raw.marketCapDelta24h),
    change24h: toNum(raw.change24h),
    createdAt: raw.createdAt,
  };
}

// Format balance with decimals
function formatBalanceRaw(raw: string | number | bigint, decimals = 18): number {
  try {
    const rawStr = typeof raw === 'bigint' ? raw.toString() : String(raw);
    return Number(formatUnits(BigInt(rawStr), decimals));
  } catch {
    return 0;
  }
}

// Parse timestamp properly - handle various formats
function parseTimestamp(timestamp: unknown): number | null {
  if (!timestamp) return null;

  try {
    // If it's already a number (unix timestamp in milliseconds)
    if (typeof timestamp === 'number') {
      // Check if it's in seconds (less than year 2100 in seconds)
      if (timestamp < 4102444800) {
        return timestamp * 1000; // Convert to milliseconds
      }
      return timestamp;
    }

    // If it's a string
    if (typeof timestamp === 'string') {
      // Try parsing as ISO string
      const date = new Date(timestamp);
      const ts = date.getTime();

      // Validate the timestamp is reasonable (between 2020 and 2030)
      const year = date.getFullYear();
      if (year >= 2020 && year <= 2030 && !isNaN(ts)) {
        return ts;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Format timestamp for display
function formatTimestamp(ts: number | null): { date: string; time: string } {
  if (!ts) {
    return { date: '—', time: '—' };
  }

  try {
    const date = new Date(ts);
    const year = date.getFullYear();

    // Validate timestamp is reasonable
    if (year < 2020 || year > 2030 || isNaN(date.getTime())) {
      return { date: '—', time: '—' };
    }

    const dateStr = date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    return { date: dateStr, time: timeStr };
  } catch {
    return { date: '—', time: '—' };
  }
}

// Fetch token metadata
async function fetchTokenMeta(address: string, chainId: number) {
  try {
    const r = await getCoin({ address, chain: chainId });
    const c = r?.data?.zora20Token;

    if (!c) return { decimals: 18, supplyRaw: null };

    // Zora tokens are always 18 decimals (ERC20 standard on Base)
    const decimals = 18;
    const supplyRaw = c.totalSupply ?? null;

    return {
      decimals,
      supplyRaw: supplyRaw != null ? String(supplyRaw) : null
    };
  } catch {
    return { decimals: 18, supplyRaw: null };
  }
}

// Process swaps with proper timestamp handling
function processSwaps(resp: ApiResponse | null, decimalsGuess = 18): ProcessedSwap[] {
  const edges = resp?.data?.zora20Token?.swapActivities?.edges || [];
  if (!edges.length) return [];

  const tokenDecimals = resp?.data?.zora20Token?.decimals != null
    ? Number(resp.data.zora20Token.decimals)
    : decimalsGuess;

  return edges.slice(0, 10).map((edge, idx) => {
    const node = edge?.node;
    if (!node) return null;

    const sideRaw = (node.activityType || '').toUpperCase();
    const isBuy = sideRaw.includes('BUY');

    const amtRaw = node.coinAmount ?? node.amount ?? '0';
    const amount = formatBalanceRaw(amtRaw, tokenDecimals);

    const usdValue = node.usdValue ?? node.coinUsdValue ?? null;

    // Try multiple timestamp fields
    const rawTs = node.blockTimestamp ?? node.timestamp ?? node.createdAt ?? node.time;
    const parsedTs = parseTimestamp(rawTs);
    const { date, time } = formatTimestamp(parsedTs);

    return {
      index: idx + 1,
      side: isBuy ? 'BUY' : 'SELL',
      amount,
      usdValue: usdValue != null ? Number(usdValue) : null,
      date,
      time,
      timestamp: parsedTs,
    } as ProcessedSwap;
  }).filter((item): item is ProcessedSwap => item !== null);
}

// Process holders with percentage calculation
async function processHolders(resp: ApiResponse | null, coinAddress: string, chainId = base.id): Promise<ProcessedHolder[]> {
  const edges = resp?.data?.zora20Token?.tokenBalances?.edges || [];
  if (!edges.length) return [];

  // Fetch token metadata for accurate calculations
  const meta = await fetchTokenMeta(coinAddress, chainId);

  // Zora tokens are always 18 decimals, but check response first
  const tokenDecimals = resp?.data?.zora20Token?.decimals != null
    ? Number(resp.data.zora20Token.decimals)
    : meta.decimals;

  let totalSupply = 0;
  if (meta.supplyRaw) {
    try {
      totalSupply = formatBalanceRaw(meta.supplyRaw, tokenDecimals);
    } catch {
      // ignore
    }
  }

  // Calculate balances for top 10
  const holders = edges.slice(0, 10).map((edge) => {
    const node = edge?.node;
    if (!node) return null;

    const holder = node.ownerProfile?.handle ||
      node.owner?.handle ||
      node.ownerAddress ||
      node.address ||
      'unknown';

    const balRaw = node.balance ?? node.formattedBalance ?? '0';
    const balance = formatBalanceRaw(balRaw, tokenDecimals);

    return { holder, balance };
  }).filter((item): item is { holder: string; balance: number } => item !== null);

  // Calculate total of top 10 for percentage
  const top10Total = holders.reduce((sum, h) => sum + h.balance, 0);
  const useTotal = totalSupply > 0 ? totalSupply : top10Total;

  // Add percentage to each holder
  return holders.map((h, idx) => {
    const percentage = useTotal > 0 ? (h.balance / useTotal) * 100 : 0;

    return {
      rank: idx + 1,
      holder: h.holder,
      balance: h.balance,
      percentage: Number(percentage.toFixed(2)),
    };
  });
}

// Process comments
function processComments(resp: ApiResponse | null): ProcessedComment[] {
  const edges = resp?.data?.zora20Token?.zoraComments?.edges || [];
  if (!edges.length) return [];

  return edges
    .slice(0, 10)
    .map((edge) => {
      const node = edge?.node;
      if (!node) return null;

      const author = node.userProfile?.handle ||
        node.user?.handle ||
        node.userAddress ||
        'anon';

      const text = (node.comment || node.text || '')
        .toString()
        .replace(/\s+/g, ' ')
        .trim();

      if (!text) return null;

      const rawTs = node.timestamp ?? node.createdAt ?? node.time;
      const parsedTs = parseTimestamp(rawTs);
      const { date } = formatTimestamp(parsedTs);

      return {
        author,
        text,
        date,
        timestamp: parsedTs,
      };
    })
    .filter((item): item is ProcessedComment => item !== null);
}

export async function GET() {
  try {
    const res = await getCoinsTopVolume24h({ count: 100 });
    const rawEdges = (res?.data?.exploreList?.edges ?? []) as ExploreEdgeRaw[];

    if (!rawEdges.length) {
      return NextResponse.json({ ok: false, error: "no-coins" }, { status: 500 });
    }

    const candidatesRaw = take(shuffle(rawEdges), 20)
      .map((e) => e?.node)
      .filter((n): n is CoinRaw => Boolean(n && n.address));

    const candidates: Coin[] = candidatesRaw.map(normalizeCoin);

    let chosen: Coin | null = null;
    let swapsData: ProcessedSwap[] = [];
    let commentsData: ProcessedComment[] = [];
    let holdersData: ProcessedHolder[] = [];

    // Find coin with activity
    for (const c of candidates) {
      const [sw, cm, ho] = await Promise.allSettled([
        getCoinSwaps({ address: c.address, chain: base.id, first: 12 }),
        getCoinComments({ address: c.address, chain: base.id, count: 20 }),
        getCoinHolders({ chainId: base.id, address: c.address, count: 10 }),
      ]);

      const swaps = sw.status === "fulfilled" && sw.value?.data?.zora20Token?.swapActivities?.edges
        ? sw.value.data.zora20Token.swapActivities.edges
        : [];

      const comments = cm.status === "fulfilled" && cm.value?.data?.zora20Token?.zoraComments?.edges
        ? cm.value.data.zora20Token.zoraComments.edges
        : [];

      const holders = ho.status === "fulfilled" && ho.value?.data?.zora20Token?.tokenBalances?.edges
        ? ho.value.data.zora20Token.tokenBalances.edges
        : [];

      if (comments.length > 0 || swaps.length > 0 || holders.length > 0) {
        chosen = c;

        // Process the data with proper formatting
        swapsData = processSwaps(sw.status === "fulfilled" ? sw.value as ApiResponse : null);
        commentsData = processComments(cm.status === "fulfilled" ? cm.value as ApiResponse : null);
        holdersData = await processHolders(
          ho.status === "fulfilled" ? ho.value as ApiResponse : null,
          c.address,
          base.id
        );
        break;
      }
    }

    // Fallback to first candidate
    if (!chosen) {
      chosen = candidates[0];
      const [sw, cm, ho] = await Promise.allSettled([
        getCoinSwaps({ address: chosen.address, chain: base.id, first: 12 }),
        getCoinComments({ address: chosen.address, chain: base.id, count: 20 }),
        getCoinHolders({ chainId: base.id, address: chosen.address, count: 10 }),
      ]);

      swapsData = processSwaps(sw.status === "fulfilled" ? sw.value as ApiResponse : null);
      commentsData = processComments(cm.status === "fulfilled" ? cm.value as ApiResponse : null);
      holdersData = await processHolders(
        ho.status === "fulfilled" ? ho.value as ApiResponse : null,
        chosen.address,
        base.id
      );
    }

    // Get full coin metadata
    const meta = await getCoin({ address: chosen.address, chain: base.id });
    const coinRaw = meta?.data?.zora20Token;
    const coin: Coin = coinRaw ? normalizeCoin(coinRaw as CoinRaw) : chosen;

    return NextResponse.json({
      ok: true,
      coin,
      details: {
        swaps: swapsData,
        comments: commentsData,
        holders: holdersData,
      },
    });
  } catch (error) {
    console.error("Spin API error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 }
    );
  }
}