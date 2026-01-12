export type BotStatus = "starting" | "running" | "paused" | "stopped" | "error";

export interface BotRuntime {
  status?: BotStatus;
  lastEventAt?: string;
  message?: string;
  risk?: {
    reason: string;
    action: string;
    ts: string;
  };
}
