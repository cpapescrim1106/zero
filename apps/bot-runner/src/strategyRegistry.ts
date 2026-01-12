import {
  SpotGridDynamicStrategy,
  SpotGridStaticStrategy,
  type Strategy
} from "@zero/strategies";

export function buildStrategyRegistry() {
  const strategies: Strategy[] = [new SpotGridStaticStrategy(), new SpotGridDynamicStrategy()];
  const registry = new Map<string, Strategy>();
  for (const strategy of strategies) {
    registry.set(strategy.key, strategy);
  }
  return registry;
}
