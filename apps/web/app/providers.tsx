"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { BotsResponse } from "../lib/api";
import { extractEvent, type HealthEvent } from "../lib/events";
import { createEventSource } from "../lib/sse";
import type { BotRuntime } from "../lib/types";

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  return (
    <QueryClientProvider client={client}>
      <EventStreamBridge />
      {children}
    </QueryClientProvider>
  );
}

function EventStreamBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = createEventSource();
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { channel: string; message: unknown };
        const normalized = extractEvent(payload);
        if (!normalized) {
          return;
        }
        if (normalized.kind === "health") {
          updateHealth(queryClient, normalized);
          return;
        }
        if (normalized.kind === "bot") {
          updateBotRuntime(queryClient, normalized.botId, {
            status: normalized.status,
            message: normalized.message,
            lastEventAt: normalized.ts
          });
          updateBotEvents(queryClient, normalized.botId, normalized);
          return;
        }
        if (normalized.kind === "risk") {
          updateBotRuntime(queryClient, normalized.botId, {
            risk: {
              reason: normalized.reason,
              action: normalized.action,
              ts: normalized.ts
            },
            lastEventAt: normalized.ts
          });
          updateBotEvents(queryClient, normalized.botId, normalized);
        }
      } catch {
        return;
      }
    };

    return () => source.close();
  }, [queryClient]);

  return null;
}

function updateBotRuntime(
  queryClient: ReturnType<typeof useQueryClient>,
  botId: string,
  runtime: BotRuntime
) {
  queryClient.setQueryData<BotsResponse>(["bots"], (data) => {
    if (!data) {
      return data;
    }
    return {
      ...data,
      bots: data.bots.map((bot) =>
        bot.id === botId ? { ...bot, runtime: { ...bot.runtime, ...runtime } } : bot
      )
    };
  });
  queryClient.setQueryData(["botRuntime", botId], (existing?: BotRuntime) => ({
    ...existing,
    ...runtime
  }));
}

function updateBotEvents(
  queryClient: ReturnType<typeof useQueryClient>,
  botId: string,
  event: unknown
) {
  queryClient.setQueryData<unknown[]>(["botEvents", botId], (existing) => {
    const next = existing ? [...existing] : [];
    next.unshift(event);
    return next.slice(0, 50);
  });
}

function updateHealth(queryClient: ReturnType<typeof useQueryClient>, event: HealthEvent) {
  queryClient.setQueryData<HealthEvent[]>(["health"], (existing) => {
    const list = existing ? [...existing] : [];
    const index = list.findIndex((item) => item.service === event.service);
    if (index >= 0) {
      list[index] = event;
    } else {
      list.push(event);
    }
    return list;
  });
}
