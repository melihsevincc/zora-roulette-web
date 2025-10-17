// lib/types.ts

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

export type ExploreEdge = { node?: Coin };

export type SpinResp = {
  ok: boolean;
  coin?: Coin;
  details?: Details;
  error?: string;
};
