import type { BotConfig } from "@zero/core";

interface ScheduleWindow {
  start: string;
  end: string;
}

export function isScheduleActive(config: BotConfig, now = new Date()): boolean {
  const schedule = config.schedule;
  if (!schedule) {
    return true;
  }
  const windows = schedule.windows ?? [];
  if (windows.length === 0) {
    return false;
  }

  const minutes = getLocalMinutes(now, schedule.timezone);
  if (minutes === null) {
    return false;
  }

  return windows.some((window) => isWithinWindow(minutes, window));
}

function isWithinWindow(minutes: number, window: ScheduleWindow) {
  const start = toMinutes(window.start);
  const end = toMinutes(window.end);
  if (start === null || end === null) {
    return false;
  }
  if (start === end) {
    return false;
  }
  if (start < end) {
    return minutes >= start && minutes < end;
  }
  return minutes >= start || minutes < end;
}

function toMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(mins) || hours > 23 || mins > 59) {
    return null;
  }
  return hours * 60 + mins;
}

function getLocalMinutes(date: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone
    });
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((part) => part.type === "hour");
    const minutePart = parts.find((part) => part.type === "minute");
    if (!hourPart || !minutePart) {
      return null;
    }
    const hours = Number(hourPart.value);
    const minutes = Number(minutePart.value);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null;
    }
    return hours * 60 + minutes;
  } catch {
    return null;
  }
}
