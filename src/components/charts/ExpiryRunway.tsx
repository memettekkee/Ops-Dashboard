import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Asset } from "@/domain/types";
import { COMPLIANCE_TOKEN } from "@/config/statusMaps";
import { formatDateID } from "@/lib/format";

const ROWS: { type: Asset["controlType"]; label: string }[] = [
  { type: "LIFTING", label: "Alat Angkat" },
  { type: "MEASURING", label: "Alat Ukur" },
  { type: "TORQUE", label: "Torque" },
];

export function ExpiryRunway({
  assets,
  today,
  onSelect,
}: {
  assets: Asset[];
  today: Date;
  onSelect: (id: string) => void;
}) {
  const base = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const months = useMemo(
    () =>
      Array.from({ length: 13 }, (_, i) => {
        const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
        return { label: d.toLocaleDateString("id-ID", { month: "short" }), year: d.getFullYear() };
      }),
    [base],
  );

  const pos = (d: Date) => {
    const monthsFromBase =
      (d.getFullYear() - base.getFullYear()) * 12 + (d.getMonth() - base.getMonth());
    const dayFrac = (d.getDate() - 1) / 30;
    return ((monthsFromBase + dayFrac) / 13) * 100;
  };

  const todayPos = pos(today);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative ml-28 h-5">
        {months.map((m, i) => (
          <span
            key={i}
            className="label-tech absolute -translate-x-1/2"
            style={{ left: `${(i / 13) * 100}%` }}
          >
            {m.label}
          </span>
        ))}
      </div>
      {ROWS.map((r) => {
        const points = assets.filter((a) => a.controlType === r.type && a.expiryDate);
        return (
          <div key={r.type} className="flex items-center gap-2">
            <div className="w-28 shrink-0 text-xs font-medium">{r.label}</div>
            <div className="relative h-9 flex-1 overflow-hidden rounded border bg-muted/30">
              {/* past zone */}
              <div
                className="absolute inset-y-0 left-0"
                style={{ width: `${Math.max(0, todayPos)}%`, backgroundColor: "color-mix(in oklch, var(--status-danger) 10%, transparent)" }}
              />
              {/* today line */}
              <div className="absolute inset-y-0 w-0.5 bg-[var(--status-danger)]" style={{ left: `${todayPos}%` }} />
              {points.map((a) => (
                <Tooltip key={a.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSelect(a.id)}
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background transition-transform hover:scale-150"
                      style={{ left: `${Math.min(100, Math.max(0, pos(a.expiryDate!)))}%`, backgroundColor: COMPLIANCE_TOKEN[a.compliance] }}
                      aria-label={`${a.id} expire ${formatDateID(a.expiryDate)}`}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="font-mono">{a.id}</div>
                    <div>Expire {formatDateID(a.expiryDate)}</div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
