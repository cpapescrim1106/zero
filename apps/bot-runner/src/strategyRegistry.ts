import {
  PerpsGridCurveStrategy,
  PerpsGridSimpleStrategy,
  SpotGridDynamicStrategy,
  SpotGridStaticStrategy,
  SpotMarketMakerSlowStrategy,
  type Strategy
} from "@zero/strategies";

export function buildStrategyRegistry() {
  const strategies: Strategy[] = [
    new SpotGridStaticStrategy(),
    new SpotGridDynamicStrategy(),
    new SpotMarketMakerSlowStrategy(),
    new PerpsGridSimpleStrategy(),
    new PerpsGridCurveStrategy()
  ];
  const registry = new Map<string, Strategy>();
  for (const strategy of strategies) {
    registry.set(strategy.key, strategy);
  }
  return registry;
}
