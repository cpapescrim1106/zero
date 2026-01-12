export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-[0.3em] text-muted">zero ops</p>
      <div>
        <h2 className="text-3xl font-semibold text-text">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}
