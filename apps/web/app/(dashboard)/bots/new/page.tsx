"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createBot, type CreateBotPayload, type BotResponse } from "../../../../lib/api";
import { computeGridSizing, type BudgetMode } from "../../../../lib/gridSizing";

const botSchema = z
  .object({
    name: z.string().min(2),
    botKind: z.enum(["spot", "drift_perps"]),
    market: z.string().min(3),
    strategyKey: z.enum([
      "spot_grid_static",
      "spot_grid_dynamic",
      "spot_mm_slow",
      "perps_grid_simple",
      "perps_grid_curve"
    ]),
    lowerPrice: z.string().optional(),
    upperPrice: z.string().optional(),
    gridCount: z.coerce.number().optional(),
    orderSize: z.string().optional(),
    maxQuoteBudget: z.string().optional(),
    maxBaseBudget: z.string().optional(),
    budgetMode: z.enum(["per_order", "total_quote", "total_base", "total_usd"]).optional(),
    budgetQuote: z.string().optional(),
    budgetBase: z.string().optional(),
    budgetTotalUsd: z.string().optional(),
    makerLevels: z.coerce.number().optional(),
    makerOrderSize: z.string().optional(),
    halfSpreadBps: z.coerce.number().optional(),
    levelSpacingBps: z.coerce.number().optional(),
    refreshSeconds: z.coerce.number().optional(),
    repriceBps: z.coerce.number().optional(),
    perpsLevels: z.coerce.number().optional(),
    perpsStepPercent: z.coerce.number().optional(),
    perpsBaseSize: z.string().optional(),
    perpsBias: z.enum(["bullish", "neutral", "bearish"]).optional(),
    targetBase: z.string().optional(),
    minBase: z.string().optional(),
    maxBase: z.string().optional(),
    preferredBase: z.string().optional()
  })
  .superRefine((values, ctx) => {
    const isPerps = values.botKind === "drift_perps";
    const spotStrategies = ["spot_grid_static", "spot_grid_dynamic", "spot_mm_slow"];
    const perpsStrategies = ["perps_grid_simple", "perps_grid_curve"];
    if (!isPerps && !spotStrategies.includes(values.strategyKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["strategyKey"], message: "Select a spot strategy" });
      return;
    }
    if (isPerps && !perpsStrategies.includes(values.strategyKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["strategyKey"], message: "Select a perps strategy" });
      return;
    }
    if (!isPerps && values.strategyKey === "spot_mm_slow") {
      if (!values.makerLevels || values.makerLevels < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["makerLevels"], message: "Levels required" });
      }
      if (!values.makerOrderSize) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["makerOrderSize"], message: "Order size required" });
      }
      if (!values.halfSpreadBps || values.halfSpreadBps < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["halfSpreadBps"], message: "Half-spread required" });
      }
      if (!values.levelSpacingBps || values.levelSpacingBps < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["levelSpacingBps"], message: "Spacing required" });
      }
      if (!values.refreshSeconds || values.refreshSeconds < 5) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["refreshSeconds"], message: "Refresh required" });
      }
      if (!values.repriceBps || values.repriceBps < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["repriceBps"], message: "Reprice threshold required" });
      }
      return;
    }

    if (isPerps && values.strategyKey === "perps_grid_curve") {
      if (!values.perpsLevels || values.perpsLevels < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["perpsLevels"], message: "Levels required" });
      }
      if (!values.perpsStepPercent || values.perpsStepPercent <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["perpsStepPercent"], message: "Step % required" });
      }
      if (!values.perpsBaseSize) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["perpsBaseSize"], message: "Base size required" });
      }
      if (!values.perpsBias) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["perpsBias"], message: "Bias required" });
      }
      return;
    }

    if (!values.lowerPrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lowerPrice"], message: "Range low required" });
    }
    if (!values.upperPrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["upperPrice"], message: "Range high required" });
    }
    if (!values.gridCount || values.gridCount < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["gridCount"], message: "Grid count required" });
    }
    if (!values.orderSize) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["orderSize"], message: "Order size required" });
    }
  });

type BotForm = z.infer<typeof botSchema>;

export default function NewBotPage() {
  const router = useRouter();
  const mutation = useMutation<BotResponse, Error, CreateBotPayload>({
    mutationFn: createBot,
    onSuccess: (data) => {
      router.push(`/bots/${data.bot.id}`);
    }
  });
  const form = useForm<BotForm>({
    resolver: zodResolver(botSchema),
    defaultValues: {
      name: "",
      botKind: "spot",
      market: "SOL/USDC",
      strategyKey: "spot_grid_static",
      lowerPrice: "120",
      upperPrice: "180",
      gridCount: 12,
      orderSize: "0.1",
      maxQuoteBudget: "",
      maxBaseBudget: "",
      budgetMode: "per_order",
      budgetQuote: "",
      budgetBase: "",
      budgetTotalUsd: "",
      makerLevels: 3,
      makerOrderSize: "0.08",
      halfSpreadBps: 30,
      levelSpacingBps: 25,
      refreshSeconds: 60,
      repriceBps: 35,
      perpsLevels: 8,
      perpsStepPercent: 0.5,
      perpsBaseSize: "0.05",
      perpsBias: "neutral",
      targetBase: "",
      minBase: "",
      maxBase: "",
      preferredBase: ""
    }
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const isPerps = values.botKind === "drift_perps";
    const isMaker = !isPerps && values.strategyKey === "spot_mm_slow";
    const venue = isPerps ? "drift_perps" : "jupiter";
    const mode = !isPerps && values.strategyKey === "spot_grid_dynamic" ? "dynamic" : "static";
    const exposureBand =
      values.minBase && values.maxBase
        ? {
            minBase: values.minBase,
            maxBase: values.maxBase,
            preferredBase: values.preferredBase || undefined
          }
        : undefined;
    await mutation.mutateAsync({
      name: values.name,
      strategyKey: values.strategyKey,
      venue,
      market: values.market,
      config: {
        name: values.name,
        strategyKey: values.strategyKey,
        venue,
        market: values.market,
        kind: isPerps ? "drift_perps" : "spot",
        mode,
        grid: isPerps
          ? undefined
          : isMaker
            ? undefined
            : {
                symbol: values.market.split("/")[0],
                lowerPrice: values.lowerPrice ?? "",
                upperPrice: values.upperPrice ?? "",
                gridCount: values.gridCount ?? 0,
                orderSize: values.orderSize ?? "",
                maxQuoteBudget: values.maxQuoteBudget || undefined,
                maxBaseBudget: values.maxBaseBudget || undefined
              },
        marketMaker: isMaker
          ? {
              symbol: values.market.split("/")[0],
              orderSize: values.makerOrderSize ?? "",
              levels: values.makerLevels ?? 0,
              halfSpreadBps: values.halfSpreadBps ?? 0,
              levelSpacingBps: values.levelSpacingBps ?? 0,
              refreshSeconds: values.refreshSeconds ?? 0,
              repriceBps: values.repriceBps ?? 0
            }
          : undefined,
        perps: isPerps
          ? {
              strategy: values.strategyKey === "perps_grid_curve" ? "curve_grid" : "simple_grid",
              simpleGrid:
                values.strategyKey === "perps_grid_simple"
                  ? {
                      symbol: values.market,
                      lowerPrice: values.lowerPrice ?? "",
                      upperPrice: values.upperPrice ?? "",
                      gridCount: values.gridCount ?? 0,
                      orderSize: values.orderSize ?? ""
                    }
                  : undefined,
              curveGrid:
                values.strategyKey === "perps_grid_curve"
                  ? {
                      symbol: values.market,
                      levels: values.perpsLevels ?? 0,
                      stepPercent: values.perpsStepPercent ?? 0,
                      baseSize: values.perpsBaseSize ?? "",
                      bias: values.perpsBias ?? "neutral"
                    }
                  : undefined,
              targetPosition: values.targetBase ? { base: values.targetBase } : undefined,
              exposureBand
            }
          : undefined
      }
    });
  });

  const botKind = form.watch("botKind");
  const strategyKey = form.watch("strategyKey");
  const isPerps = botKind === "drift_perps";
  const isMaker = !isPerps && strategyKey === "spot_mm_slow";
  const isPerpsCurve = isPerps && strategyKey === "perps_grid_curve";
  const budgetMode = (form.watch("budgetMode") ?? "per_order") as BudgetMode;
  const lowerPrice = form.watch("lowerPrice");
  const upperPrice = form.watch("upperPrice");
  const gridCount = form.watch("gridCount");
  const orderSize = form.watch("orderSize");
  const budgetQuote = form.watch("budgetQuote");
  const budgetBase = form.watch("budgetBase");
  const budgetTotalUsd = form.watch("budgetTotalUsd");

  const sizing = useMemo(() => {
    if (isPerps || isMaker) {
      return {
        mid: null,
        step: null,
        buyCount: 0,
        sellCount: 0,
        derivedOrderSize: null,
        requiredQuote: null,
        requiredBase: null,
        targetQuoteBudget: null,
        targetBaseBudget: null,
        minOrderNotional: null
      };
    }
    return computeGridSizing({
      lowerPrice,
      upperPrice,
      gridCount,
      orderSize,
      budgetMode,
      budgetQuote,
      budgetBase,
      budgetTotalUsd
    });
  }, [isPerps, isMaker, lowerPrice, upperPrice, gridCount, orderSize, budgetMode, budgetQuote, budgetBase, budgetTotalUsd]);

  const handleCalculate = () => {
    if (isPerps || isMaker || budgetMode === "per_order") {
      return;
    }
    const next = computeGridSizing({
      lowerPrice,
      upperPrice,
      gridCount,
      orderSize,
      budgetMode,
      budgetQuote,
      budgetBase,
      budgetTotalUsd
    });
    if (!next.derivedOrderSize) {
      return;
    }
    form.setValue("orderSize", next.derivedOrderSize.toFixed(6), {
      shouldDirty: true,
      shouldValidate: true
    });
    if (next.targetQuoteBudget !== null) {
      form.setValue("maxQuoteBudget", next.targetQuoteBudget.toFixed(2), { shouldDirty: true });
    }
    if (next.targetBaseBudget !== null) {
      form.setValue("maxBaseBudget", next.targetBaseBudget.toFixed(6), { shouldDirty: true });
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-border bg-panel/90 p-6 shadow-card"
      >
        <div className="grid gap-6">
          <div>
            <h3 className="text-xl font-semibold">Create Bot</h3>
            <p className="mt-2 text-sm text-muted">Define the grid parameters and launch.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" error={form.formState.errors.name?.message}>
              <input className="input" {...form.register("name")} placeholder="SOL range" />
            </Field>
            <Field label="Bot type" error={form.formState.errors.botKind?.message}>
              <select className="input" {...form.register("botKind")}>
                <option value="spot">Spot</option>
                <option value="drift_perps">Drift perps</option>
              </select>
            </Field>
            <Field label="Market" error={form.formState.errors.market?.message}>
              <input className="input" {...form.register("market")} placeholder={isPerps ? "SOL-PERP" : "SOL/USDC"} />
            </Field>
            <Field label="Strategy" error={form.formState.errors.strategyKey?.message}>
              <select className="input" {...form.register("strategyKey")}>
                {isPerps ? (
                  <>
                    <option value="perps_grid_simple">Perps grid (simple)</option>
                    <option value="perps_grid_curve">Perps grid (curve)</option>
                  </>
                ) : (
                  <>
                    <option value="spot_grid_static">Spot grid (static)</option>
                    <option value="spot_grid_dynamic">Spot grid (dynamic)</option>
                    <option value="spot_mm_slow">Slow market maker</option>
                  </>
                )}
              </select>
            </Field>
          </div>

          {isMaker ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Levels per side" error={form.formState.errors.makerLevels?.message}>
                <input className="input" type="number" {...form.register("makerLevels")} />
              </Field>
              <Field label="Order size" error={form.formState.errors.makerOrderSize?.message}>
                <input className="input" {...form.register("makerOrderSize")} />
              </Field>
              <Field label="Half spread (bps)" error={form.formState.errors.halfSpreadBps?.message}>
                <input className="input" type="number" {...form.register("halfSpreadBps")} />
              </Field>
              <Field label="Level spacing (bps)" error={form.formState.errors.levelSpacingBps?.message}>
                <input className="input" type="number" {...form.register("levelSpacingBps")} />
              </Field>
              <Field label="Refresh seconds" error={form.formState.errors.refreshSeconds?.message}>
                <input className="input" type="number" {...form.register("refreshSeconds")} />
              </Field>
              <Field label="Reprice threshold (bps)" error={form.formState.errors.repriceBps?.message}>
                <input className="input" type="number" {...form.register("repriceBps")} />
              </Field>
            </div>
          ) : isPerpsCurve ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Levels" error={form.formState.errors.perpsLevels?.message}>
                <input className="input" type="number" {...form.register("perpsLevels")} />
              </Field>
              <Field label="Step % (grid spacing)" error={form.formState.errors.perpsStepPercent?.message}>
                <input className="input" type="number" step="0.01" {...form.register("perpsStepPercent")} />
              </Field>
              <Field label="Base size" error={form.formState.errors.perpsBaseSize?.message}>
                <input className="input" {...form.register("perpsBaseSize")} />
              </Field>
              <Field label="Bias" error={form.formState.errors.perpsBias?.message}>
                <select className="input" {...form.register("perpsBias")}>
                  <option value="bullish">Bullish</option>
                  <option value="neutral">Neutral</option>
                  <option value="bearish">Bearish</option>
                </select>
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Range low" error={form.formState.errors.lowerPrice?.message}>
                <input className="input" {...form.register("lowerPrice")} />
              </Field>
              <Field label="Range high" error={form.formState.errors.upperPrice?.message}>
                <input className="input" {...form.register("upperPrice")} />
              </Field>
              <Field label="Grid count" error={form.formState.errors.gridCount?.message}>
                <input className="input" type="number" {...form.register("gridCount")} />
              </Field>
              {!isPerps && (
                <Field label="Sizing mode">
                  <select className="input" {...form.register("budgetMode")}>
                    <option value="per_order">Per-order size</option>
                    <option value="total_quote">Total quote budget (USDC)</option>
                    <option value="total_base">Total base budget (SOL)</option>
                    <option value="total_usd">Total budget split (USD)</option>
                  </select>
                </Field>
              )}
              <Field label="Order size" error={form.formState.errors.orderSize?.message}>
                <input
                  className="input"
                  {...form.register("orderSize")}
                  disabled={!isPerps && budgetMode !== "per_order"}
                />
              </Field>
              {!isPerps && budgetMode === "total_quote" ? (
                <Field label="Total quote budget (USDC)">
                  <div className="flex gap-2">
                    <input className="input" {...form.register("budgetQuote")} />
                    <button type="button" className="btn-outline" onClick={handleCalculate}>
                      Calculate
                    </button>
                  </div>
                </Field>
              ) : null}
              {!isPerps && budgetMode === "total_base" ? (
                <Field label="Total base budget (SOL)">
                  <div className="flex gap-2">
                    <input className="input" {...form.register("budgetBase")} />
                    <button type="button" className="btn-outline" onClick={handleCalculate}>
                      Calculate
                    </button>
                  </div>
                </Field>
              ) : null}
              {!isPerps && budgetMode === "total_usd" ? (
                <Field label="Total budget (USD)">
                  <div className="flex gap-2">
                    <input className="input" {...form.register("budgetTotalUsd")} />
                    <button type="button" className="btn-outline" onClick={handleCalculate}>
                      Calculate
                    </button>
                  </div>
                </Field>
              ) : null}
              {!isPerps && (
                <>
                  <Field label="Max quote budget (USDC)">
                    <input className="input" {...form.register("maxQuoteBudget")} placeholder="Optional" />
                  </Field>
                  <Field label="Max base budget (SOL)">
                    <input className="input" {...form.register("maxBaseBudget")} placeholder="Optional" />
                  </Field>
                </>
              )}
            </div>
          )}

          {isPerps && (
            <div className="rounded-xl border border-border bg-white/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">Exposure intent (optional)</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Target base">
                  <input className="input" {...form.register("targetBase")} placeholder="0.25" />
                </Field>
                <Field label="Preferred base">
                  <input className="input" {...form.register("preferredBase")} placeholder="0.1" />
                </Field>
                <Field label="Min base">
                  <input className="input" {...form.register("minBase")} placeholder="-0.2" />
                </Field>
                <Field label="Max base">
                  <input className="input" {...form.register("maxBase")} placeholder="0.2" />
                </Field>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-full bg-accent px-6 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-60"
          >
            {mutation.isPending ? "Creating..." : "Create bot"}
          </button>
          {mutation.error ? (
            <p className="text-sm text-red-600">Failed to create bot.</p>
          ) : null}
        </div>
      </form>

      <div className="flex flex-col gap-4">
        {!isPerps && !isMaker ? (
          <div className="rounded-xl border border-border bg-white/70 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Funding estimate</p>
            <p className="mt-3 text-sm text-muted">
              Based on mid-price {(sizing.mid ?? 0).toFixed(2)} and {sizing.buyCount} buys /{" "}
              {sizing.sellCount} sells. Grid requires both quote + base unless you cap one side.
            </p>
            <div className="mt-4 grid gap-2 text-sm text-text">
              <div className="flex items-center justify-between">
                <span>Order size</span>
                <span>{sizing.derivedOrderSize ? sizing.derivedOrderSize.toFixed(6) : "--"} SOL</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Quote needed (buys)</span>
                <span>{sizing.requiredQuote ? sizing.requiredQuote.toFixed(2) : "--"} USDC</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Base needed (sells)</span>
                <span>{sizing.requiredBase ? sizing.requiredBase.toFixed(6) : "--"} SOL</span>
              </div>
              <div className="flex items-center justify-between text-muted">
                <span>Per-order notional</span>
                <span>{sizing.minOrderNotional ? sizing.minOrderNotional.toFixed(2) : "--"} USDC</span>
              </div>
            </div>
            {sizing.minOrderNotional !== null && sizing.minOrderNotional < 5 ? (
              <p className="mt-3 text-xs text-red-600">Order notional below Jupiter 5 USDC minimum.</p>
            ) : null}
          </div>
        ) : null}
        <div className="rounded-xl border border-border bg-white/70 p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Guidance</p>
          <p className="mt-3 text-sm text-text">
            {isPerps
              ? "Perps bots use leverage. Keep exposure bands tight until you’ve validated funding and risk settings."
              : "Grid runs bracket the price; slow market maker posts fewer, wider levels and refreshes on a timer or drift threshold."}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white/70 p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Risk defaults</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Max notional and inventory will stop the bot immediately.</li>
            <li>Stale data timeout defaults to 30 seconds.</li>
            <li>Execution stays off until you flip EXECUTION_ENABLED.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  error,
  children
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-xs uppercase tracking-[0.2em] text-muted">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </label>
  );
}
