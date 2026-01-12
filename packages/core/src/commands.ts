export type BotCommandAction = "start" | "stop" | "pause" | "resume" | "update_config";

export interface BotCommand {
  version: "v1";
  id: string;
  botId: string;
  action: BotCommandAction;
  ts: string;
  payload?: Record<string, unknown>;
}
