export type Cluster = "mainnet-beta" | "devnet" | "localnet";

export type TokenInfo = {
  symbol: string;
  mint: string;
  decimals: number;
};

export const TOKEN_REGISTRY: Record<Cluster, Record<string, TokenInfo>> = {
  "mainnet-beta": {
    SOL: { symbol: "SOL", mint: "So11111111111111111111111111111111111111112", decimals: 9 },
    USDC: { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
    USDT: { symbol: "USDT", mint: "Es9vMFrzaCER1a6c7fggkP6yqoCqkf9rD8qt4V9rW", decimals: 6 }
  },
  devnet: {
    SOL: { symbol: "SOL", mint: "So11111111111111111111111111111111111111112", decimals: 9 },
    USDC: { symbol: "USDC", mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", decimals: 6 }
  },
  localnet: {
    SOL: { symbol: "SOL", mint: "So11111111111111111111111111111111111111112", decimals: 9 }
  }
};

const TOKENS_BY_MINT: Record<Cluster, Record<string, TokenInfo>> = {
  "mainnet-beta": buildMintIndex(TOKEN_REGISTRY["mainnet-beta"]),
  devnet: buildMintIndex(TOKEN_REGISTRY.devnet),
  localnet: buildMintIndex(TOKEN_REGISTRY.localnet)
};

export function getTokensForCluster(cluster: Cluster | undefined) {
  return TOKEN_REGISTRY[cluster ?? "mainnet-beta"] ?? TOKEN_REGISTRY["mainnet-beta"];
}

export function getTokenByMint(mint: string, cluster: Cluster | undefined): TokenInfo | undefined {
  const resolved = cluster ?? "mainnet-beta";
  return TOKENS_BY_MINT[resolved]?.[mint] ?? TOKENS_BY_MINT["mainnet-beta"]?.[mint];
}

function buildMintIndex(tokens: Record<string, TokenInfo>) {
  return Object.values(tokens).reduce<Record<string, TokenInfo>>((acc, token) => {
    acc[token.mint] = token;
    return acc;
  }, {});
}
