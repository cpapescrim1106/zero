export function formatCompactNumber(value: number, decimals = 1) {
  const abs = Math.abs(value);
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (abs < 1000) {
    return abs % 1 === 0 ? value.toFixed(0) : value.toFixed(decimals);
  }
  const units = ["k", "m", "b", "t"] as const;
  let unitIndex = -1;
  let scaled = abs;
  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }
  const formatted = scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2);
  return `${value < 0 ? "-" : ""}${formatted}${units[unitIndex] ?? ""}`;
}

export function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `$${formatCompactNumber(value, 2)}`;
}

export function formatSignedUsd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${formatCompactNumber(value, 2)}`;
}

export function formatPct(value: number | null | undefined, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  if (value >= 1000) {
    return value.toFixed(2);
  }
  if (value >= 1) {
    return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatQty(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return formatCompactNumber(value, 2);
}

export function formatTimeAgo(ts: number | string) {
  const date = typeof ts === "string" ? new Date(ts) : new Date(ts);
  const delta = Date.now() - date.getTime();
  if (!Number.isFinite(delta)) {
    return "—";
  }
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatSigned(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value >= 0 ? "+" : "";
  return `${sign}${formatCompactNumber(value, 2)}${suffix}`;
}
