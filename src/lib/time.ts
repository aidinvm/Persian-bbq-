// Calgary timezone helpers (America/Edmonton)

export const STORE_TIMEZONE = "America/Edmonton";

/**
 * Returns YYYY-MM-DD for a Date in Calgary timezone
 */
export function toStoreDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/**
 * Get current date/time components in Calgary timezone
 */
function getCalgaryNowParts(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: num("year"),
    month: num("month"),
    day: num("day"),
    hour: num("hour") % 24,
    minute: num("minute"),
  };
}

/**
 * Checks whether a pickup date (YYYY-MM-DD) is still accepting orders.
 * Cutoff is `cutoffHour`:00 (default 21:00 = 9:00 PM) the evening BEFORE pickup in Calgary time.
 */
export function isDateAcceptingOrders(
  pickupDateStr: string,
  cutoffEnabled: boolean,
  cutoffHour: number = 21,
  now: Date = new Date()
): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pickupDateStr);
  if (!match) return false;

  const pYear = Number(match[1]);
  const pMonth = Number(match[2]);
  const pDay = Number(match[3]);

  const calgaryNow = getCalgaryNowParts(now);
  const todayUtc = Date.UTC(calgaryNow.year, calgaryNow.month - 1, calgaryNow.day);
  const pickupUtc = Date.UTC(pYear, pMonth - 1, pDay);
  const diffDays = Math.round((pickupUtc - todayUtc) / 86_400_000);

  if (!cutoffEnabled) {
    // Allow ordering up until the pickup day itself
    return diffDays >= 0;
  }

  // Strictly before day-before pickup -> open
  if (diffDays > 1) return true;
  // Day before pickup -> open only before cutoffHour (e.g. 21:00)
  if (diffDays === 1) {
    return calgaryNow.hour < cutoffHour;
  }
  // Pickup day or past -> closed
  return false;
}

/**
 * Returns the next upcoming Saturday and Sunday YYYY-MM-DD strings (at least 2 days out so default seeds are always open)
 */
export function getUpcomingWeekendDates(now: Date = new Date()): string[] {
  const base = new Date(now.getTime());
  base.setDate(base.getDate() + 2);
  const results: string[] = [];

  for (let i = 0; i < 14 && results.length < 2; i++) {
    const candidate = new Date(base.getTime() + i * 86_400_000);
    const day = candidate.getDay(); // 0 = Sun, 6 = Sat
    if (day === 6 || day === 0) {
      results.push(toStoreDateString(candidate));
    }
  }
  return results.length > 0 ? results : [toStoreDateString(base)];
}

/**
 * Formats YYYY-MM-DD cleanly for English or Farsi display
 */
export function formatPickupDate(dateStr: string, lang: "en" | "fa"): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  if (lang === "fa") {
    return new Intl.DateTimeFormat("fa-IR-u-ca-gregory", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(dt);
  }
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(dt);
}

export function getDateCardParts(dateStr: string, lang: "en" | "fa") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return { weekday: "", day: dateStr, month: "" };
  const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  const locale = lang === "fa" ? "fa-IR-u-ca-gregory" : "en-US";
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(dt),
    day: new Intl.DateTimeFormat(locale, { day: "numeric" }).format(dt),
    month: new Intl.DateTimeFormat(locale, { month: "short" }).format(dt),
  };
}

/**
 * Sort time labels like "12:00 PM", "1:00 PM", "5:30 PM", "17:00" chronologically
 */
export function parseTimeToMinutes(label: string): number {
  const trimmed = label.trim().toUpperCase();
  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/.exec(trimmed);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    if (ampm[3] === "PM" && h !== 12) h += 12;
    if (ampm[3] === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }
  const h24 = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (h24) {
    return Number(h24[1]) * 60 + Number(h24[2]);
  }
  return 9999;
}

export function sortTimeSlots(slots: string[]): string[] {
  return [...slots].sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b));
}

export function format24hTo12h(time24: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!m) return time24;
  let h = Number(m[1]);
  const min = m[2];
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${suffix}`;
}
