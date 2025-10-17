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
        getCoinSwaps({ address: c.address, chain: base.id, first: 10 }),
        getCoinComments({ address: c.address, chain: base.id, count: 10 }),
        getCoinHolders({ chainId: base.id, address: c.address, count: 10 }),
      ]);

      // Swaps mapping - getCoinSwaps returns swapActivities
      const swaps: Array<{ node?: SwapNode }> = [];
      if (sw.status === "fulfilled" && sw.value?.data?.zora20Token?.swapActivities?.edges) {
        const edges = sw.value.data.zora20Token.swapActivities.edges;
        swaps.push(...edges.map((e: { node?: SwapNode }) => ({ node: e?.node })));
      }

      // Comments mapping - getCoinComments returns zoraComments
      const comments: Array<{ node?: CommentNode }> = [];
      if (cm.status === "fulfilled" && cm.value?.data?.zora20Token?.zoraComments?.edges) {
        const edges = cm.value.data.zora20Token.zoraComments.edges;
        comments.push(...edges.map((e: { node?: CommentNode }) => ({ node: e?.node })));
      }

      // Holders mapping - getCoinHolders returns tokenBalances
      const holders: Array<{ node?: HolderNode }> = [];
      if (ho.status === "fulfilled" && ho.value?.data?.zora20Token?.tokenBalances?.edges) {
        const edges = ho.value.data.zora20Token.tokenBalances.edges;
        holders.push(...edges.map((e: { node?: HolderNode }) => ({ node: e?.node })));
      }

      // Check if we have any data
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
        getCoinSwaps({ address: chosen.address, chain: base.id, first: 10 }),
        getCoinComments({ address: chosen.address, chain: base.id, count: 10 }),
        getCoinHolders({ chainId: base.id, address: chosen.address, count: 10 }),
      ]);

      const swaps: Array<{ node?: SwapNode }> = [];
      if (sw.status === "fulfilled" && sw.value?.data?.zora20Token?.swapActivities?.edges) {
        swaps.push(...sw.value.data.zora20Token.swapActivities.edges.map((e: { node?: SwapNode }) => ({ node: e?.node })));
      }

      const comments: Array<{ node?: CommentNode }> = [];
      if (cm.status === "fulfilled" && cm.value?.data?.zora20Token?.zoraComments?.edges) {
        comments.push(...cm.value.data.zora20Token.zoraComments.edges.map((e: { node?: CommentNode }) => ({ node: e?.node })));
      }

      const holders: Array<{ node?: HolderNode }> = [];
      if (ho.status === "fulfilled" && ho.value?.data?.zora20Token?.tokenBalances?.edges) {
        holders.push(...ho.value.data.zora20Token.tokenBalances.edges.map((e: { node?: HolderNode }) => ({ node: e?.node })));
      }

      details = { swaps, comments, holders };
    }

    // Get full coin metadata
    const meta = await getCoin({ address: chosen.address, chain: base.id });
    const coinRaw = (meta?.data?.zora20Token as CoinRaw) ?? null;
    const coin: Coin = coinRaw ? normalizeCoin(coinRaw) : chosen;

    return NextResponse.json({ ok: true, coin, details });
  } catch (error) {
    console.error("Spin API error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 }
    );
  }
}