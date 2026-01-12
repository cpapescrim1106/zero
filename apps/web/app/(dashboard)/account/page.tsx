export default function AccountPage() {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-panel/90 p-6 shadow-card">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Wallet equity</p>
        <div className="mt-4 h-40 rounded-xl border border-dashed border-border bg-white/60" />
      </div>
      <div className="rounded-xl border border-border bg-panel/90 p-6 shadow-card">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Allocation</p>
        <div className="mt-4 h-40 rounded-xl border border-dashed border-border bg-white/60" />
      </div>
      <div className="rounded-xl border border-border bg-panel/90 p-6 shadow-card lg:col-span-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Fees over time</p>
        <div className="mt-4 h-40 rounded-xl border border-dashed border-border bg-white/60" />
      </div>
    </section>
  );
}
