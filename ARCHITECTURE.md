# zero Architecture

## Overview
zero is a single-user, single-machine bot platform with clear isolation between UI/API and runtime services. It is designed for rapid UI iteration while keeping trading execution safe and restartable.

## Services
- **apps/web**: Next.js dashboard (SSE + charts).
- **apps/api**: HTTP API + SSE. Publishes commands to Redis and streams events to UI.
- **apps/market-data**: Helius WS ingestion + normalization. Read-only, publishes events to Redis.
- **apps/bot-runner**: Strategy runtime + risk governor + execution connectors. Holds Solana keys.

## Non-negotiables
1) Strategy never talks directly to venue APIs. Strategies emit **Intents** only.
2) Market-data is read-only and isolated; it does not trade.
3) Risk governor can veto everything. Hard stops pause the bot and emit risk events.
4) Restartability: services must reconstruct from Postgres + Redis latest-state caches.
5) Private keys live only in bot-runner. Web/API never see keys.
6) Favored integrates only over HTTP/SSE/WebSocket (no shared runtime coupling).

## Core Data Flow (MVP)
1) market-data ingests Helius WS data and publishes normalized events to Redis.
2) bot-runner consumes market-data events, updates state, runs strategies, emits Intents.
3) risk governor validates Intents; execution connector submits/cancels orders.
4) bot-runner persists orders/fills/events/snapshots to Postgres.
5) bot-runner publishes bot events to Redis; API streams to UI over SSE.

## Messaging
- Redis Pub/Sub for real-time events and commands.
- Redis cache for latest state and health heartbeats.

## Persistence
- Postgres is the source of truth.
- Canonical event_log is versioned JSONB for replay tooling later.

## Execution
- MVP connector: Jupiter Limit Orders.
- Reconcile loop to self-heal and ensure state correctness.
