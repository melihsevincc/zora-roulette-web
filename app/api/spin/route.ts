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

setApiKey(process.env.ZORA_API_KEY || "");

export const dynamic = "force-dynamic"; // her çağrıda taze

function pick<T>(arr: T[], n = 1): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export async function GET() {
  try {
    // geniş havuz: yüksek hacimden 100 çek
    const res = await getCoinsTopVolume24h({ count: 100 });
    const edges = res?.data?.exploreList?.edges || [];
    if (!edges.length) return NextResponse.json({ ok: false, error: "no-coins" }, { status: 500 });

    // shuffle + ilk 20 adaydan birini seç
    const candidates = pick(edges, Math.min(20, edges.length)).map((e: any) => e.node).filter(Boolean);
    let chosen: any = null, details: any = null;

    // aktivite öncelikli seçim
    for (const c of candidates) {
      if (!c?.address) continue;
      const [sw, cm, ho] = await Promise.allSettled([
        getCoinSwaps({ address: c.address, chain: base.id, first: 10 }),
        getCoinComments({ address: c.address, chain: base.id, count: 10 }),
        getCoinHolders({ chainId: base.id, address: c.address, count: 10 }),
      ]);
      const swaps = sw.status === "fulfilled" ? (sw.value?.data?.zora20Token?.swapActivities?.edges || []) : [];
      const comments = cm.status === "fulfilled" ? (
        cm.value?.data?.zora20Token?.zoraComments?.edges ||
        cm.value?.data?.zora20Token?.comments?.edges ||
        []
      ) : [];
      const holders = ho.status === "fulfilled" ? (ho.value?.data?.zora20Token?.tokenBalances?.edges || []) : [];

      if (comments.length || swaps.length || holders.length) {
        chosen = c;
        details = { swaps, comments, holders };
        break;
      }
    }

    if (!chosen) chosen = candidates[0];

    // coin meta (decimals/supply gibi)
    const meta = await getCoin({ address: chosen.address, chain: base.id });
    const coin = meta?.data?.coin || chosen;

    return NextResponse.json({ ok: true, coin, details });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
