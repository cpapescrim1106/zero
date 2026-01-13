Canonical Spec: zero Perps (Drift) — MVP

Below is the one-page spec you can hand directly to an implementation agent. It reflects every decision you made.

1) Account & Bot Model

1 bot = 1 Drift subaccount

1 perps market per bot (MVP)

Cross-margin within the bot only

Subaccounts are auto-created by bot-runner

Signing keys exist only in bot-runner

2) Strategy Intent Model

Strategies emit high-level exposure intent

Allowed external forms:

TargetPosition

ExposureBand

All intents normalize internally to ExposureBand

ExposureBand (normalized)

min_base, max_base

preferred_base computed from curve

Strategy supplies curve description, not raw orders

3) Grid / Curve Definition (Pionex-style)

Range computation

Lookbacks: 1h / 4h / 1D / 1W

Percentile band: configurable, default 5–95

Windows blended with weights:

1h 0.35

4h 0.30

1D 0.25

1W 0.10

Curve types

linear

stepwise (grid-like)

Grid specifics

Step spacing: %-based

Anchor: mark price

Bias: bullish / neutral / bearish

Bias implemented via asymmetric ladder

Fixed base size per grid level

Range exit behavior

Bounded grid: stop opening new exposure; manage exits only

Infinity grid: follow price, still capped by risk

4) Execution Model

PerpsConnector = smart execution engine

Hybrid control loop:

Event-driven (fills, price moves, risk flags)

Periodic heartbeat (repair / verify)

Connector owns:

ladder construction

order TTL / requote

cancel / replace

state tracking

ExecutionPolicy (per strategy)

grid levels

step %

base size per level

maker-preferred

max slippage (bps)

requote threshold

TTL

ramp-in parameters

Execution Governor (per bot)

Strict priority:

risk / liquidation defense

exposure reduction

grid

5) Safety & Risk (Hard Constraints A–G)

Risk Governor enforces all as hard rules:

A) liquidation buffer (liq price % AND health ratio; tighter wins)

B) leverage cap

C) max daily loss

D) max notional

E) funding guardrail

F) oracle/mark divergence pause

G) reduce-only trigger

Risk outputs

APPROVE

CLAMP

REDUCE_ONLY

PAUSE

Reduce-only behavior

Cancel all bids

Keep only reduce-only asks

Pause behavior

Cancel all orders

Leave position untouched

6) Startup & Volatility

Gradual ramp-in on start/restart

Hybrid volatility response

mild auto-widening / slow cadence

hard clamps or pause via Risk

7) Funding

Track event-based truth

Maintain continuous estimate for UI

Reconcile via snapshots

8) Market-Data Requirements

mark price (HF)

best bid / ask

oracle price

funding rate + next funding time

mark-oracle divergence

volatility proxy (optional but recommended)

9) Persistence (minimum tables)

perps_accounts

perps_positions

perps_margin_snapshots

perps_funding_snapshots

perps_objectives

10) UI (MVP)

Position size, entry, mark

Leverage

Liquidation price + distance

Unrealized / realized / funding PnL

Risk state badge (normal / reduce-only / paused)

Grid parameters + bias