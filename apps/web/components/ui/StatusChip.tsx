const tones = {
  running: "bg-emerald-100 text-emerald-800 border-emerald-200",
  paused: "bg-amber-100 text-amber-800 border-amber-200",
  stopped: "bg-slate-100 text-slate-700 border-slate-200",
  error: "bg-rose-100 text-rose-800 border-rose-200",
  scheduled: "bg-indigo-100 text-indigo-800 border-indigo-200",
  warning: "bg-orange-100 text-orange-800 border-orange-200",
  ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
  degraded: "bg-amber-100 text-amber-800 border-amber-200",
  down: "bg-rose-100 text-rose-800 border-rose-200"
} as const;

export default function StatusChip({
  label,
  tone
}: {
  label: string;
  tone: keyof typeof tones;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${
        tones[tone]
      }`}
    >
      {label}
    </span>
  );
}
