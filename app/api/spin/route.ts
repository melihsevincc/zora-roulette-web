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

function extractSwapEdges(resp: any): any[] {
  return (
    resp?.data?.zora20Token?.swapActivities?.edges ||
    resp?.data?.coin?.swapActivities?.edges ||
    resp?.data?.swaps?.edges ||
    []
  );
}

function extractCommentEdges(resp: any): any[] {
  return (
    resp?.data?.zora20Token?.zoraComments?.edges ||
    resp?.data?.zora20Token?.comments?.edges ||
    resp?.data?.coin?.zoraComments?.edges ||
    resp?.data?.coin?.comments?.edges ||
    resp?.data?.comments?.edges ||
    []
  );
}

function extractHolderEdges(resp: any): any[] {
  return (
    resp?.data?.zora20Token?.tokenBalances?.edges ||
    resp?.data?.coin?.tokenBalances?.edges ||
    []
  );
}

// Token meta fetch helper
async function fetchTokenMeta(address: string, chainId: number) {
  try {
    const r = await getCoin({ address, chain: chainId });
    const c = r?.data?.coin || r?.coin || r;
    const decimals = c?.decimals ?? c?.token?.decimals ?? c?.zora20Token?.decimals ?? null;
    const supplyRaw = c?.totalSupply ?? c?.supply ?? c?.stats?.totalSupply ?? c?.zora20Token?.totalSupply ?? null;
    return { decimals: decimals != null ? Number(decimals) : null, supplyRaw };
  } catch {
    return { decimals: null, supplyRaw: null };
  }
}

// Format balance helper
function formatBalanceRaw(raw: string | number, decimals = 18): number {
  try {
    return Number(formatUnits(BigInt(raw), decimals));
  } catch {
    return 0;
  }
}

// Process holders with percentage calculation
async function processHolders(resp: any, coinAddress: string, chainId = base.id) {
  const edges = extractHolderEdges(resp);
  if (!edges.length) return [];

  const meta = await fetchTokenMeta(coinAddress, chainId);
  const tokenDecimals = meta.decimals != null ? meta.decimals
    : (resp?.data?.zora20Token?.decimals != null ? Number(resp.data.zora20Token.decimals) : 18);

  let supplyNum = NaN;
  try {
    if (meta.supplyRaw != null) {
      supplyNum = Number(formatUnits(BigInt(meta.supplyRaw), tokenDecimals));
    }
  } catch { }

  let sumTop10 = 0;
  const holders = edges.slice(0, 10).map(({ node }: any, i: number) => {
    const who = node?.ownerProfile?.handle || node?.ownerAddress || 'unknown';
    const balRaw = node?.balance ?? node?.formattedBalance ?? '0';
    const balNum = formatBalanceRaw(balRaw, tokenDecimals);

    if (Number.isFinite(balNum)) sumTop10 += balNum;

    const percentage = Number.isFinite(supplyNum) && supplyNum > 0
      ? (balNum / supplyNum) * 100
      : (sumTop10 > 0 ? (balNum / sumTop10) * 100 : 0);

    return {
      rank: i + 1,
      holder: who,
      balance: balNum,
      percentage,
    };
  });

  return holders;
}

// Process swaps
function processSwaps(resp: any, decimalsGuess = 18) {
  const edges = extractSwapEdges(resp);
  if (!edges.length) return [];

  const tokenDecimals = resp?.data?.zora20Token?.decimals != null
    ? Number(resp.data.zora20Token.decimals)
    : decimalsGuess;

  return edges.slice(0, 12).map(({ node }: any, idx: number) => {
    const sideRaw = (node?.activityType || '').toUpperCase();
    const isBuy = sideRaw.includes('BUY');
    const amtRaw = node?.coinAmount ?? node?.amount ?? '0';
    const amount = formatBalanceRaw(amtRaw, tokenDecimals);
    const usdValue = node?.usdValue ?? node?.coinUsdValue ?? null;

    let timestamp = null;
    if (node?.blockTimestamp) {
      const d = new Date(node.blockTimestamp);
      if (d.getFullYear() > 1971 && d.getFullYear() < 2100) {
        timestamp = d.toISOString();
      }
    }

    return {
      index: idx + 1,
      side: isBuy ? 'BUY' : 'SELL',
      amount,
      usdValue: usdValue != null ? Number(usdValue) : null,
      timestamp,
    };
  });
}

// Process comments
function processComments(resp: any) {
  const edges = extractCommentEdges(resp);
  if (!edges.length) return [];

  const cleaned = edges
    .map(({ node }: any) => ({
      who: node?.userProfile?.handle || node?.user?.handle || node?.userAddress || 'anon',
      text: (node?.comment || node?.text || '').toString().replace(/\s+/g, ' ').trim(),
      ts: Number(node?.timestamp ?? node?.createdAt ?? 0)
    }))
    .filter((x: any) => x.text)
    .map((x: any) => {
      const y = isNaN(x.ts) ? 0 : new Date(x.ts).getFullYear();
      const tsOk = y > 1971 && y < 2100;
      return { ...x, ts: tsOk ? x.ts : 0 };
    })
    .sort((a: any, b: any) => b.ts - a.ts);

  return cleaned.slice(0, 5).map((c: any, i: number) => ({
    index: i + 1,
    author: c.who,
    text: c.text,
    timestamp: c.ts ? new Date(c.ts).toISOString() : null,
  }));
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
    let swapsData: any[] = [];
    let commentsData: any[] = [];
    let holdersData: any[] = [];

    // Find coin with activity
    for (const c of candidates) {
      const [sw, cm, ho] = await Promise.allSettled([
        getCoinSwaps({ address: c.address, chain: base.id, first: 12 }),
        getCoinComments({ address: c.address, chain: base.id, count: 20 }),
        getCoinHolders({ chainId: base.id, address: c.address, count: 10 }),
      ]);

      const swaps = sw.status === "fulfilled" ? extractSwapEdges(sw.value) : [];
      const comments = cm.status === "fulfilled" ? extractCommentEdges(cm.value) : [];
      const holders = ho.status === "fulfilled" ? extractHolderEdges(ho.value) : [];

      if (comments.length > 0 || swaps.length > 0 || holders.length > 0) {
        chosen = c;

        // Process the data properly
        swapsData = processSwaps(sw.status === "fulfilled" ? sw.value : null);
        commentsData = processComments(cm.status === "fulfilled" ? cm.value : null);
        holdersData = await processHolders(
          ho.status === "fulfilled" ? ho.value : null,
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

      swapsData = processSwaps(sw.status === "fulfilled" ? sw.value : null);
      commentsData = processComments(cm.status === "fulfilled" ? cm.value : null);
      holdersData = await processHolders(
        ho.status === "fulfilled" ? ho.value : null,
        chosen.address,
        base.id
      );
    }

    // Get full coin metadata
    const meta = await getCoin({ address: chosen.address, chain: base.id });
    const coinRaw = meta?.data?.zora20Token ?? meta?.data?.coin ?? meta?.coin ?? null;
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