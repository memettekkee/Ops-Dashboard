import { format } from "date-fns";
import { id } from "date-fns/locale";

export function formatDateID(d: Date | undefined | null): string {
  if (!d) return "—";
  return format(d, "d MMM yyyy", { locale: id });
}

export function formatMonthID(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return format(new Date(y, m - 1, 1), "MMM yyyy", { locale: id });
}

const numberFmt = new Intl.NumberFormat("id-ID");
export function formatNumberID(n: number | undefined | null, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatInt(n: number | undefined | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return numberFmt.format(n);
}

export function formatPct(n: number | undefined | null, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function formatDays(days: number | undefined): string {
  if (days === undefined) return "—";
  if (days < 0) return `${Math.abs(days)} hari lalu`;
  if (days === 0) return "hari ini";
  return `${days} hari lagi`;
}
