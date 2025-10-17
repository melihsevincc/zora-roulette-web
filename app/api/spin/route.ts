import { NextResponse } from "next/server";

// Zora'nın ana GraphQL API adresi
const ZORA_API_URL = "https://api.zora.co/graphql";

// Zora API'sine göndereceğimiz GraphQL sorgusu.
// Bu sorgu, hacme göre sıralanmış coin'lerden rastgele birini seçer,
// ardından o coin'in temel bilgilerini, son 10 işlemini (mints) ve ilk 10 sahibini (tokenHolders) çeker.
const GQL_QUERY = `
query SpinQuery {
  tokens(
    networks: [{network: ZORA, chain: ZORA_MAINNET}],
    sort: {sortKey: VOLUME, sortDirection: DESC},
    pagination: {limit: 50} # Hacmi en yüksek ilk 50 coin'den birini seçeceğiz
  ) {
    nodes {
      token {
        collectionAddress
        name
        symbol
        totalSupply
        market {
          marketCap {
            usd
          }
          volume {
            usd
          }
          change24h {
            percent
          }
        }
        ... on ERC20Token {
          # Son 10 işlemi (mint) çekiyoruz. Bu bizim "swaps" verimiz olacak.
          mints(pagination: {limit: 10}) {
            nodes {
              transactionInfo {
                blockTimestamp
              }
              value {
                usd
              }
              quantity
            }
          }
          # İlk 10 sahibi çekiyoruz. Bu bizim "holders" verimiz olacak.
          tokenHolders(pagination: {limit: 10}) {
            nodes {
              ownerAddress
              balance
            }
          }
        }
      }
    }
  }
}
`;

export async function GET() {
  try {
    // Zora API'sine POST isteği gönderiyoruz.
    const apiResponse = await fetch(ZORA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: GQL_QUERY }),
      // Vercel'in önbelleklemesini engellemek için 'no-store' kullanıyoruz.
      next: { revalidate: 0 },
    });

    if (!apiResponse.ok) {
      throw new Error(`Zora API hatası: ${apiResponse.statusText}`);
    }

    const json = await apiResponse.json();
    const tokens = json.data?.tokens?.nodes;

    if (!tokens || tokens.length === 0) {
      throw new Error("Zora API'sinden coin listesi alınamadı.");
    }

    // Gelen coin listesinden rastgele bir tane seçiyoruz.
    const randomNode = tokens[Math.floor(Math.random() * tokens.length)];
    const tokenData = randomNode.token;

    // API'den gelen veriyi ön yüzün beklediği formata dönüştürüyoruz.
    const coin = {
      name: tokenData.name,
      symbol: tokenData.symbol,
      address: tokenData.collectionAddress,
      marketCap: tokenData.market?.marketCap?.usd,
      volume24h: tokenData.market?.volume?.usd,
      uniqueHolders: null, // Bu sorguyla bu veriyi direkt alamıyoruz, isterseniz başka bir sorgu gerekebilir.
      change24h: tokenData.market?.change24h?.percent,
      createdAt: null, // Aynı şekilde bu veri için de ayrı bir sorgu gerekebilir.
    };

    // Swaps ve Holders verilerini de ön yüz formatına uygun hale getiriyoruz.
    const details = {
      swaps: tokenData.mints?.nodes.map((mint: any) => ({
        // Ön yüzdeki coerceSwap fonksiyonunun anlayacağı anahtarları burada bilerek kullanıyoruz.
        transactionInfo: mint.transactionInfo,
        value: mint.value,
        quantity: mint.quantity,
        type: 'BUY' // Mint işlemleri genellikle 'ALIM' olarak kabul edilebilir.
      })) || [],
      holders: tokenData.tokenHolders?.nodes.map((holder: any) => ({
        owner: holder.ownerAddress,
        balance: holder.balance,
      })) || [],
    };

    return NextResponse.json({ ok: true, coin, details });

  } catch (error) {
    console.error("API Route Hatası:", error);
    const errorMessage = error instanceof Error ? error.message : "Bilinmeyen bir sunucu hatası oluştu.";
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
