import type { Intent } from "@zero/core";
import type { Strategy, StrategyContext } from "@zero/strategies";

export class IntentEngine {
  async run(strategy: Strategy, context: StrategyContext): Promise<Intent[]> {
    return strategy.run(context);
  }
}
