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
import type {
  Coin,
  CoinRaw,
  ExploreEdgeRaw,
  Details,
  SwapNode,
  CommentNode,
  HolderNode,
} from "@/lib/types";

setApiKey(process.env.ZORA_API_KEY || "");
export const dynamic = "force-dynamic";

// utils
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
    let details: Details | null = null;

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
        details = { swaps, comments, holders };
        break;
      }
    }

    // Fallback to first candidate if no details found
    if (!chosen) {
      chosen = candidates[0];
      // Try to get details for first candidate anyway
      const [sw, cm, ho] = await Promise.allSettled([
        getCoinSwaps({ address: chosen.address, chain: base.id, first: 12 }),
        getCoinComments({ address: chosen.address, chain: base.id, count: 20 }),
        getCoinHolders({ chainId: base.id, address: chosen.address, count: 10 }),
      ]);

      const swaps = sw.status === "fulfilled" ? extractSwapEdges(sw.value) : [];
      const comments = cm.status === "fulfilled" ? extractCommentEdges(cm.value) : [];
      const holders = ho.status === "fulfilled" ? extractHolderEdges(ho.value) : [];

      details = { swaps, comments, holders };
    }

    // Get full coin metadata
    const meta = await getCoin({ address: chosen.address, chain: base.id });
    const coinRaw = meta?.data?.zora20Token ?? meta?.data?.coin ?? meta?.coin ?? null;
    const coin: Coin = coinRaw ? normalizeCoin(coinRaw as CoinRaw) : chosen;

    return NextResponse.json({ ok: true, coin, details });
  } catch (error) {
    console.error("Spin API error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 }
    );
  }
}