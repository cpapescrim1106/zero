export type BudgetMode = "per_order" | "total_quote" | "total_base" | "total_usd";

export type GridSizingInput = {
  lowerPrice?: string;
  upperPrice?: string;
  gridCount?: number;
  orderSize?: string;
  budgetMode?: BudgetMode;
  budgetQuote?: string;
  budgetBase?: string;
  budgetTotalUsd?: string;
};

export type GridSizingResult = {
  mid: number | null;
  step: number | null;
  buyCount: number;
  sellCount: number;
  derivedOrderSize: number | null;
  requiredQuote: number | null;
  requiredBase: number | null;
  targetQuoteBudget: number | null;
  targetBaseBudget: number | null;
  minOrderNotional: number | null;
};

export function computeGridSizing(input: GridSizingInput): GridSizingResult {
  const lower = toNumber(input.lowerPrice);
  const upper = toNumber(input.upperPrice);
  const count = Number.isFinite(input.gridCount) ? Math.max(1, Math.floor(input.gridCount as number)) : null;
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || !count || upper <= lower) {
    return emptyResult();
  }
  const step = count === 1 ? 0 : (upper - lower) / (count - 1);
  const mid = (lower + upper) / 2;
  const prices: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const price = lower + step * i;
    if (step > 0 && Math.abs(price - mid) < step * 0.1) {
      continue;
    }
    prices.push(price);
  }
  const buys = prices.filter((price) => price < mid).sort((a, b) => b - a);
  const sells = prices.filter((price) => price > mid).sort((a, b) => a - b);
  const buyCount = buys.length;
  const sellCount = sells.length;
  const sumBuyPrices = buys.reduce((acc, price) => acc + price, 0);

  const mode = input.budgetMode ?? "per_order";
  const quoteBudgetInput = toNumber(input.budgetQuote);
  const baseBudgetInput = toNumber(input.budgetBase);
  const totalUsdInput = toNumber(input.budgetTotalUsd);

  let targetQuoteBudget: number | null = null;
  let targetBaseBudget: number | null = null;
  if (mode === "total_quote" && Number.isFinite(quoteBudgetInput)) {
    targetQuoteBudget = quoteBudgetInput;
    targetBaseBudget = Number.isFinite(mid) && mid > 0 ? quoteBudgetInput / mid : null;
  } else if (mode === "total_base" && Number.isFinite(baseBudgetInput)) {
    targetBaseBudget = baseBudgetInput;
    targetQuoteBudget = Number.isFinite(mid) ? baseBudgetInput * mid : null;
  } else if (mode === "total_usd" && Number.isFinite(totalUsdInput)) {
    targetQuoteBudget = totalUsdInput / 2;
    targetBaseBudget = Number.isFinite(mid) && mid > 0 ? (totalUsdInput / 2) / mid : null;
  }

  let derivedOrderSize: number | null = null;
  if (mode === "per_order") {
    const size = toNumber(input.orderSize);
    derivedOrderSize = Number.isFinite(size) && size > 0 ? size : null;
  } else if (targetQuoteBudget !== null || targetBaseBudget !== null) {
    const fromQuote = buyCount > 0 && targetQuoteBudget !== null ? targetQuoteBudget / sumBuyPrices : Number.POSITIVE_INFINITY;
    const fromBase = sellCount > 0 && targetBaseBudget !== null ? targetBaseBudget / sellCount : Number.POSITIVE_INFINITY;
    const derived = Math.min(fromQuote, fromBase);
    derivedOrderSize = Number.isFinite(derived) && derived > 0 ? derived : null;
  }

  const requiredQuote =
    derivedOrderSize !== null && buyCount > 0 ? sumBuyPrices * derivedOrderSize : null;
  const requiredBase = derivedOrderSize !== null && sellCount > 0 ? sellCount * derivedOrderSize : null;
  const minOrderNotional = derivedOrderSize !== null && Number.isFinite(mid) ? derivedOrderSize * mid : null;

  return {
    mid,
    step,
    buyCount,
    sellCount,
    derivedOrderSize,
    requiredQuote,
    requiredBase,
    targetQuoteBudget,
    targetBaseBudget,
    minOrderNotional
  };
}

export function recommendGridCount(
  input: GridSizingInput,
  minOrderNotional = 5
): number | null {
  const current = Number.isFinite(input.gridCount) ? Math.max(1, Math.floor(input.gridCount as number)) : null;
  if (!current) {
    return null;
  }
  for (let count = current; count >= 2; count -= 1) {
    const sizing = computeGridSizing({ ...input, gridCount: count });
    if (sizing.derivedOrderSize && sizing.minOrderNotional && sizing.minOrderNotional >= minOrderNotional) {
      return count;
    }
  }
  return null;
}

function toNumber(value?: string | number | null) {
  if (value === undefined || value === null) {
    return NaN;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function emptyResult(): GridSizingResult {
  return {
    mid: null,
    step: null,
    buyCount: 0,
    sellCount: 0,
    derivedOrderSize: null,
    requiredQuote: null,
    requiredBase: null,
    targetQuoteBudget: null,
    targetBaseBudget: null,
    minOrderNotional: null
  };
}
