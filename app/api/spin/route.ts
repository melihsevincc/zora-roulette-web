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
} from "@/lib/types"; // Bu tipleri projenizde tanımladığınızı varsayıyorum.

// API anahtarınızı environment variables'dan alıyoruz.
setApiKey(process.env.ZORA_API_KEY || "");
export const dynamic = "force-dynamic";

// --- Yardımcı Fonksiyonlar (Değişiklik yok) ---
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
    const n = Number(v.replace(/,/g, "")); // Alt çizgi yerine virgül de olabilir
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
// ----------------------------------------------

export async function GET() {
  try {
    const res = await getCoinsTopVolume24h({ count: 100 });
    const rawEdges = (res?.data?.exploreList?.edges ?? []) as ExploreEdgeRaw[];
    if (!rawEdges.length) {
      return NextResponse.json({ ok: false, error: "Zora'dan coin listesi alınamadı." }, { status: 500 });
    }

    const candidatesRaw = take(shuffle(rawEdges), 20)
      .map((e) => e?.node)
      .filter((n): n is CoinRaw => Boolean(n && n.address));

    if (candidatesRaw.length === 0) {
      return NextResponse.json({ ok: false, error: "Uygun formatta coin adayı bulunamadı." }, { status: 500 });
    }

    const candidates: Coin[] = candidatesRaw.map(normalizeCoin);

    let chosen: Coin | null = null;
    let details: Details | null = null;

    for (const c of candidates) {
      const [sw, cm, ho] = await Promise.allSettled([
        getCoinSwaps({ address: c.address, chain: base.id, first: 10 }),
        getCoinComments({ address: c.address, chain: base.id, count: 10 }),
        getCoinHolders({ chainId: base.id, address: c.address, count: 10 }),
      ]);

      // --- DEĞİŞİKLİK BAŞLANGICI: Veriyi burada temizliyoruz ---
      // Gelen verinin içindeki `node` objelerini ayıklıyoruz.
      const swaps =
        sw.status === "fulfilled"
          ? ((sw.value?.data?.zora20Token?.swapActivities?.edges ?? []) as Array<{ node?: SwapNode }>)
            .map(edge => edge.node) // .map() ile 'node' objesini dışarı çıkar
            .filter(Boolean) as SwapNode[] // Boş olanları filtrele
          : [];

      const comments =
        cm.status === "fulfilled"
          ? ((cm.value?.data?.zora20Token?.zoraComments?.edges ?? []) as Array<{ node?: CommentNode }>)
            .map(edge => edge.node)
            .filter(Boolean) as CommentNode[]
          : [];

      const holders =
        ho.status === "fulfilled"
          ? ((ho.value?.data?.zora20Token?.tokenBalances?.edges ?? []) as Array<{ node?: HolderNode }>)
            .map(edge => edge.node)
            .filter(Boolean) as HolderNode[]
          : [];
      // --- DEĞİŞİKLİK SONU ---

      if (swaps.length > 0 || holders.length > 0) { // Yorumları kontrol etmeye gerek yok
        chosen = c;
        details = { swaps, comments, holders };
        break;
      }
    }

    if (!chosen) {
      chosen = candidates[0]; // Hiçbirinde detay bulunamazsa ilkini seç
      details = { swaps: [], comments: [], holders: [] }; // Detayları boş olarak ata
    }

    // Coin'in en güncel verisini tekrar çekiyoruz
    const meta = await getCoin({ address: chosen.address, chain: base.id });
    const coinRaw = (meta?.data?.zora20Token as CoinRaw) ?? null;
    const coin: Coin = coinRaw ? normalizeCoin(coinRaw) : chosen;

    return NextResponse.json({ ok: true, coin, details });

  } catch (err) {
    const error = err as Error;
    console.error("Zora API Route Hatası:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

