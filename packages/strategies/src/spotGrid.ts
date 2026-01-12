import type { Intent } from "@zero/core";
import type { Strategy, StrategyContext } from "./types";

export class SpotGridStaticStrategy implements Strategy {
  key = "spot_grid_static";

  async run(_: StrategyContext): Promise<Intent[]> {
    return [];
  }
}

export class SpotGridDynamicStrategy implements Strategy {
  key = "spot_grid_dynamic";

  async run(_: StrategyContext): Promise<Intent[]> {
    return [];
  }
}
