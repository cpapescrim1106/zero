"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  fetchPerpsRiskConfig,
  updatePerpsRiskConfig,
  type PerpsRiskConfig,
  type PerpsRiskConfigResponse
} from "../../../../lib/api";

const DEFAULTS: PerpsRiskConfig = {
  liquidationBufferPct: 5,
  liquidationBufferHealthRatio: 1.2,
  leverageCap: 3,
  maxDailyLoss: "150",
  maxNotional: "2000",
  fundingGuardrailBps: 50,
  markOracleDivergenceBps: 50,
  reduceOnlyTriggerBps: 200
};

export default function PerpsSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<PerpsRiskConfigResponse>({
    queryKey: ["perpsRiskConfig"],
    queryFn: fetchPerpsRiskConfig
  });
  const mutation = useMutation({
    mutationFn: (config: PerpsRiskConfig) => updatePerpsRiskConfig(config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["perpsRiskConfig"] });
    }
  });

  const form = useForm<PerpsRiskConfig>({
    defaultValues: DEFAULTS
  });

  useEffect(() => {
    if (data?.config) {
      form.reset(data.config);
    }
  }, [data, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    await mutation.mutateAsync(values);
  });

  return (
    <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <form onSubmit={onSubmit} className="rounded-xl border border-border bg-panel/90 p-6 shadow-card">
        <div className="grid gap-6">
          <div>
            <h3 className="text-xl font-semibold">Perps settings</h3>
            <p className="mt-2 text-sm text-muted">Global risk limits for Drift perps bots.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Liquidation buffer (%)">
              <input className="input" type="number" step="0.1" {...form.register("liquidationBufferPct", { valueAsNumber: true })} />
            </Field>
            <Field label="Min health ratio">
              <input
                className="input"
                type="number"
                step="0.01"
                {...form.register("liquidationBufferHealthRatio", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Leverage cap">
              <input className="input" type="number" step="0.1" {...form.register("leverageCap", { valueAsNumber: true })} />
            </Field>
            <Field label="Max daily loss (USD)">
              <input className="input" {...form.register("maxDailyLoss")} />
            </Field>
            <Field label="Max notional (USD)">
              <input className="input" {...form.register("maxNotional")} />
            </Field>
            <Field label="Funding guardrail (bps)">
              <input
                className="input"
                type="number"
                step="1"
                {...form.register("fundingGuardrailBps", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Mark-oracle divergence (bps)">
              <input
                className="input"
                type="number"
                step="1"
                {...form.register("markOracleDivergenceBps", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Reduce-only trigger (bps)">
              <input
                className="input"
                type="number"
                step="1"
                {...form.register("reduceOnlyTriggerBps", { valueAsNumber: true })}
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={mutation.isPending || isLoading}
            className="rounded-full bg-accent px-6 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-60"
          >
            {mutation.isPending ? "Saving..." : "Save settings"}
          </button>
          {mutation.error ? <p className="text-sm text-red-600">Failed to update settings.</p> : null}
        </div>
      </form>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-white/70 p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Notes</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Edits apply to all perps bots on the next risk refresh.</li>
            <li>Start with conservative limits while you validate fills.</li>
            <li>Funding guardrail triggers reduce-only mode.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-xs uppercase tracking-[0.2em] text-muted">{label}</span>
      {children}
    </label>
  );
}
