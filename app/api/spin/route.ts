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

// Projenizde bu tiplerin bulunduğu varsayılıyor, örn: /lib/types.ts
type Coin = {
  name: string;
  symbol?: string;
  address: string;
  marketCap?: number;
  volume24h?: number;
  uniqueHolders?: number;
  marketCapDelta24h?: number;
  change24h?: number;
  createdAt?: string;
};
type CoinRaw = any;
type ExploreEdgeRaw = any;
type SwapNode = any;
type CommentNode = any;
type HolderNode = any;
type Details = {
  swaps: any[];
  comments: any[];
  holders: any[];
};

// API anahtarınızı environment variables'dan alıyoruz.
// .env.local dosyanızda ZORA_API_KEY="..." satırının olduğundan emin olun.
setApiKey(process.env.ZORA_API_KEY || "");

// Vercel'in bu rotayı her istekte yeniden çalıştırmasını sağlar.
export const dynamic = "force-dynamic";

// --- Yardımcı Fonksiyonlar ---
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const toNum = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
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
// ----------------------------

export async function GET() {
  try {
    const res = await getCoinsTopVolume24h({ count: 100 });
    const rawEdges = (res?.data?.exploreList?.edges ?? []) as ExploreEdgeRaw[];
    if (!rawEdges.length) {
      return NextResponse.json({ ok: false, error: "Zora'dan coin listesi alınamadı." }, { status: 500 });
    }

    const candidatesRaw = shuffle(rawEdges)
      .map((e) => e?.node)
      .filter((n): n is CoinRaw => Boolean(n && n.address));

    if (candidatesRaw.length === 0) {
      return NextResponse.json({ ok: false, error: "Uygun formatta coin adayı bulunamadı." }, { status: 500 });
    }

    let chosenCoin: Coin | null = null;
    let details: Details | null = null;

    for (const rawCandidate of candidatesRaw) {
      const candidateCoin = normalizeCoin(rawCandidate);
      const [swapsResult, holdersResult, commentsResult] = await Promise.allSettled([
        getCoinSwaps({ address: candidateCoin.address, chain: base.id, first: 10 }),
        getCoinHolders({ chainId: base.id, address: candidateCoin.address, count: 10 }),
        getCoinComments({ address: candidateCoin.address, chain: base.id, count: 10 }),
      ]);

      // DEĞİŞİKLİK: Veriyi burada temizliyor ve frontend için hazırlıyoruz.
      // SDK'dan gelen `{ node: ... }` yapısını ayıklıyoruz.
      const swaps =
        swapsResult.status === "fulfilled"
          ? ((swapsResult.value?.data?.zora20Token?.swapActivities?.edges ?? []) as Array<{ node?: SwapNode }>)
            .map(edge => edge.node) // .map() ile sadece 'node' objesini al
            .filter(Boolean) // Boş olanları filtrele
          : [];

      const holders =
        holdersResult.status === "fulfilled"
          ? ((holdersResult.value?.data?.zora20Token?.tokenBalances?.edges ?? []) as Array<{ node?: HolderNode }>)
            .map(edge => {
              if (!edge.node) return null;
              // `balance` alanı BigInt olabilir, JSON ile uyumlu olması için String'e çeviriyoruz.
              return {
                owner: edge.node.owner,
                balance: String(edge.node.balance ?? '0'),
                ens: edge.node.ens,
              };
            })
            .filter(Boolean)
          : [];

      // En az bir işlem veya sahip bilgisi varsa bu coini seçiyoruz.
      if (swaps.length > 0 && holders.length > 0) {
        chosenCoin = candidateCoin;

        const comments =
          commentsResult.status === "fulfilled"
            ? ((commentsResult.value?.data?.zora20Token?.zoraComments?.edges ?? []) as Array<{ node?: CommentNode }>)
              .map(edge => edge.node)
              .filter(Boolean)
            : [];

        details = { swaps, comments, holders };
        break; // Döngüden çık
      }
    }

    // Eğer döngüde uygun bir coin bulunamazsa (hepsinin bilgisi boşsa), ilk adayı seçiyoruz.
    if (!chosenCoin) {
      chosenCoin = normalizeCoin(candidatesRaw[0]);
      details = { swaps: [], comments: [], holders: [] }; // Detayları boş olarak ata
    }

    return NextResponse.json({ ok: true, coin: chosenCoin, details });

  } catch (err) {
    const error = err as Error;
    console.error("Zora API Route Hatası:", error.message);
    let errorMessage = "Bilinmeyen bir sunucu hatası oluştu.";
    if (error.message.includes("API key")) {
      errorMessage = "Zora API anahtarı geçersiz veya eksik. Lütfen .env.local dosyasını kontrol edin.";
    }
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}

