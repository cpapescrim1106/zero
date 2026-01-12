import StatusChip from "./StatusChip";
import type { HealthEvent } from "../../lib/events";

export default function HealthBanner({ events }: { events: HealthEvent[] }) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-white/80 px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-[0.3em] text-muted">System</span>
        {events.map((event) => (
          <div key={event.service} className="flex items-center gap-2 text-xs">
            <StatusChip label={event.service} tone={event.status} />
            {event.message ? <span className="text-muted">{event.message}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
