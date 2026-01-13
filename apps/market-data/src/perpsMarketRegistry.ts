import Redis from "ioredis";
import type { BotCommand, BotConfig } from "@zero/core";

type RegistryChangeHandler = (markets: string[]) => void;

export class PerpsMarketRegistry {
  private subscriber: Redis;
  private markets = new Set<string>();
  private botMarkets = new Map<string, string>();
  private onChange?: RegistryChangeHandler;

  constructor(redisUrl: string, initialMarkets: string[] = []) {
    this.subscriber = new Redis(redisUrl);
    initialMarkets.forEach((market) => this.markets.add(normalizePerpsSymbol(market)));
  }

  getMarkets() {
    return Array.from(this.markets.values());
  }

  onUpdate(handler: RegistryChangeHandler) {
    this.onChange = handler;
  }

  async start() {
    await this.subscriber.psubscribe("cmd:bot:*");
    this.subscriber.on("pmessage", (_pattern, _channel, message) => {
      const command = parseCommand(message);
      if (!command || command.action !== "update_config" || !command.payload?.config) {
        return;
      }
      const config = command.payload.config as BotConfig;
      this.updateBotMarket(command.botId, config);
    });
  }

  async stop() {
    await this.subscriber.quit();
  }

  private updateBotMarket(botId: string, config: BotConfig) {
    const current = this.botMarkets.get(botId);
    const next = resolvePerpsMarket(config);
    if (current && current !== next) {
      this.markets.delete(current);
      this.botMarkets.delete(botId);
    }
    if (next) {
      this.markets.add(next);
      this.botMarkets.set(botId, next);
    }
    this.onChange?.(this.getMarkets());
  }
}

function parseCommand(message: string): BotCommand | null {
  try {
    const payload = JSON.parse(message) as BotCommand;
    if (!payload || payload.version !== "v1" || !payload.botId || !payload.action) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function resolvePerpsMarket(config: BotConfig) {
  if (!isPerpsBot(config)) {
    return null;
  }
  if (config.perps?.simpleGrid?.symbol) {
    return normalizePerpsSymbol(config.perps.simpleGrid.symbol);
  }
  if (config.perps?.curveGrid?.symbol) {
    return normalizePerpsSymbol(config.perps.curveGrid.symbol);
  }
  if (config.market) {
    return normalizePerpsSymbol(config.market);
  }
  return null;
}

function isPerpsBot(config: BotConfig) {
  const kind = config.kind ?? (config.venue === "drift_perps" ? "drift_perps" : "spot");
  return kind === "drift_perps";
}

function normalizePerpsSymbol(symbol: string) {
  const trimmed = symbol.trim().toUpperCase();
  if (trimmed.includes("-PERP")) {
    return trimmed;
  }
  if (trimmed.includes("/")) {
    const base = trimmed.split("/")[0]?.trim() ?? trimmed;
    return `${base}-PERP`;
  }
  return `${trimmed}-PERP`;
}
