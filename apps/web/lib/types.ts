export type BotStatus = "starting" | "running" | "paused" | "stopped" | "error";

export interface BotRuntime {
  status?: BotStatus;
  lastEventAt?: string;
  message?: string;
  lastPrice?: string;
  pnlRealized?: string;
  pnlUnrealized?: string;
  equity?: string;
  inventoryBase?: string;
  inventoryQuote?: string;
  startNav?: string;
  startPrice?: string;
  risk?: {
    reason: string;
    action: string;
    ts: string;
  };
}
