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
  decimals?: number;
  totalSupply?: string | number;
};

export type ExploreEdgeRaw = { node?: CoinRaw; cursor?: string };

// Uygulama içinde kullanacağımız normalize edilmiş coin (number'lar number)
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
  decimals?: number;
};

// SDK'dan gelen swap node yapısı
export type SwapNode = {
  activityType?: string; // "BUY" | "SELL"
  coinAmount?: string;
  usdValue?: number;
  blockTimestamp?: string | number;
  from?: string;
  to?: string;
};

// SDK'dan gelen comment node yapısı
export type CommentNode = {
  userProfile?: {
    handle?: string;
    username?: string;
  };
  user?: {
    handle?: string;
    username?: string;
  };
  userAddress?: string;
  comment?: string;
  text?: string;
  timestamp?: number | string;
  createdAt?: number | string;
};

// SDK'dan gelen holder node yapısı
export type HolderNode = {
  ownerProfile?: {
    handle?: string;
    username?: string;
  };
  ownerAddress?: string;
  balance?: string;
  formattedBalance?: string;
  owner?: string;
  ownerEns?: string;
};

// Details response structure
export type Details = {
  swaps: Array<{ node?: SwapNode }>;
  comments: Array<{ node?: CommentNode }>;
  holders: Array<{ node?: HolderNode }>;
};

// Spin API response
export type SpinResp = {
  ok: boolean;
  coin?: Coin;
  details?: Details;
  error?: string;
};