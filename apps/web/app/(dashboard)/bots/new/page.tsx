"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createBot, type CreateBotPayload, type BotResponse } from "../../../../lib/api";

const botSchema = z.object({
  name: z.string().min(2),
  market: z.string().min(3),
  strategyKey: z.enum(["spot_grid_static", "spot_grid_dynamic"]),
  venue: z.string().min(2),
  lowerPrice: z.string().min(1),
  upperPrice: z.string().min(1),
  gridCount: z.coerce.number().min(2),
  orderSize: z.string().min(1)
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
      market: "SOL/USDC",
      strategyKey: "spot_grid_static",
      venue: "jupiter",
      lowerPrice: "120",
      upperPrice: "180",
      gridCount: 12,
      orderSize: "0.1"
    }
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await mutation.mutateAsync({
      name: values.name,
      strategyKey: values.strategyKey,
      venue: values.venue,
      market: values.market,
      config: {
        name: values.name,
        strategyKey: values.strategyKey,
        venue: values.venue,
        market: values.market,
        mode: values.strategyKey === "spot_grid_dynamic" ? "dynamic" : "static",
        grid: {
          symbol: values.market.split("/")[0],
          lowerPrice: values.lowerPrice,
          upperPrice: values.upperPrice,
          gridCount: values.gridCount,
          orderSize: values.orderSize
        }
      }
    });
  });

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
            <Field label="Market" error={form.formState.errors.market?.message}>
              <input className="input" {...form.register("market")} />
            </Field>
            <Field label="Strategy" error={form.formState.errors.strategyKey?.message}>
              <select className="input" {...form.register("strategyKey")}>
                <option value="spot_grid_static">Spot grid (static)</option>
                <option value="spot_grid_dynamic">Spot grid (dynamic)</option>
              </select>
            </Field>
            <Field label="Venue" error={form.formState.errors.venue?.message}>
              <input className="input" {...form.register("venue")} />
            </Field>
          </div>

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
            <Field label="Order size" error={form.formState.errors.orderSize?.message}>
              <input className="input" {...form.register("orderSize")} />
            </Field>
          </div>

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
        <div className="rounded-xl border border-border bg-white/70 p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Guidance</p>
          <p className="mt-3 text-sm text-text">
            Use narrow ranges for higher fill frequency. Dynamic mode adds recentering
            logic and re-anchors as SOL drifts.
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
