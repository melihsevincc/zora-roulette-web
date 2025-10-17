// lib/types.ts

// API'den gelen ham coin (birçok alan string olabilir)
export type CoinRaw = {
  address: string;
  name: string;
  symbol?: string;
  marketCap?: string | number;
  volume24h?: string | number;
  uniqueHolders?: string | number;
  marketCapDelta24h?: string | number;
  change24h?: string | number;
  createdAt?: number | string;
  // diğer alanlar da olabilir; biz şu an ihtiyaç kadarını tanımlıyoruz
};

export type ExploreEdgeRaw = { node?: CoinRaw; cursor?: string };

// Uygulama içinde kullanacağımız normalize edilmiş coin (number’lar number)
export type Coin = {
  address: string;
  name: string;
  symbol?: string;
  marketCap?: number;
  volume24h?: number;
  uniqueHolders?: number;
  marketCapDelta24h?: number;
  change24h?: number;
  createdAt?: number | string;
};

export type SwapNode = {
  activityType?: string;
  coinAmount?: string;
  usdValue?: number;
  blockTimestamp?: string | number;
};

export type CommentNode = {
  userProfile?: { handle?: string };
  user?: { handle?: string };
  userAddress?: string;
  comment?: string;
  text?: string;
  timestamp?: number | string;
  createdAt?: number | string;
};

export type HolderNode = {
  ownerProfile?: { handle?: string };
  ownerAddress?: string;
  balance?: string;
  formattedBalance?: string;
};

export type Details = {
  swaps: Array<{ node?: SwapNode }>;
  comments: Array<{ node?: CommentNode }>;
  holders: Array<{ node?: HolderNode }>;
};

export type SpinResp = {
  ok: boolean;
  coin?: Coin;
  details?: Details;
  error?: string;
};
